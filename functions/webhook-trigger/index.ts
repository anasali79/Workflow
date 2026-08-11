
/**
 * Nhost Function: webhook-trigger
 *
 * Handles public webhook invocations for workflows that have a `webhook` trigger.
 *
 * Endpoint:
 *   POST /webhook-trigger?triggerId=<UUID>
 *
 * Also supports a UUID embedded in the request path.
 *
 * Security:
 *   - Validates x-webhook-secret header
 *   - Validates trigger exists and is enabled
 *   - Verifies trigger type is 'webhook'
 *   - Does NOT trust client-submitted workflowId or orgId
 *   - Supports idempotency through x-idempotency-key
 *   - SSRF protection is handled by the workflow engine
 */

import { queryOne } from "../services/database/client.js";
import { workflowEngine } from "../services/workflow-engine/engine.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import {
  assertValidUuid,
  errorResponse,
  successResponse,
  validateWebhookSecret,
} from "../utils/http.js";

interface WorkflowTriggerRow {
  id: string;
  workflow_id: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

type HeaderValue = string | string[] | undefined;

type NhostHeaders = Record<string, HeaderValue>;

type NhostRequest = Request & {
  headers: NhostHeaders;
  body?: unknown;
  originalUrl?: string;
  path?: string;
  query?: Record<string, unknown>;
};

/**
 * Normalize Nhost/Express/Node headers.
 *
 * IMPORTANT:
 * Do NOT use req.headers.entries().
 * Nhost Functions provide Node/Express-style headers.
 */
function normalizeHeaders(
  headers: NhostHeaders,
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(headers || {})) {
    if (Array.isArray(value)) {
      normalized[key.toLowerCase()] = value.join(", ");
    } else {
      normalized[key.toLowerCase()] = value;
    }
  }

  return normalized;
}

/**
 * Extract trigger ID from the Nhost request.
 *
 * Supported:
 *
 * 1. Query parameter:
 *    /webhook-trigger?triggerId=<UUID>
 *
 * 2. Query parameter:
 *    /webhook-trigger?trigger_id=<UUID>
 *
 * 3. UUID anywhere in the request URL:
 *    /webhook-trigger/<UUID>
 *
 * 4. UUID in originalUrl if provided by Express.
 *
 * 5. UUID in path if provided by Express.
 *
 * We intentionally use URL(..., base) so relative URLs from
 * Express/Nhost never produce "Invalid URL".
 */
function extractTriggerId(req: NhostRequest): string {
  const possibleUrls = [
    req.originalUrl,
    req.url,
    req.path,
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.length > 0,
  );

  /**
   * First check Express query object if available.
   */
  if (req.query) {
    const queryTriggerId =
      req.query.triggerId ??
      req.query.trigger_id;

    if (
      typeof queryTriggerId === "string" &&
      queryTriggerId.trim().length > 0
    ) {
      return queryTriggerId.trim();
    }
  }

  /**
   * Check every possible URL representation.
   */
  for (const rawUrl of possibleUrls) {
    try {
      /**
       * The second argument makes relative URLs valid.
       *
       * Example:
       *   new URL("/webhook-trigger", "http://localhost")
       *
       * instead of:
       *   new URL("/webhook-trigger") // Invalid URL
       */
      const parsedUrl = new URL(
        rawUrl,
        "http://localhost",
      );

      /**
       * Check query parameters.
       */
      const queryTriggerId =
        parsedUrl.searchParams.get("triggerId") ||
        parsedUrl.searchParams.get("trigger_id");

      if (queryTriggerId) {
        return queryTriggerId.trim();
      }

      /**
       * Check UUID inside pathname.
       */
      const uuidMatch = parsedUrl.pathname.match(
        /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      );

      if (uuidMatch?.[1]) {
        return uuidMatch[1];
      }
    } catch {
      /**
       * Ignore malformed URL representation and continue
       * checking other available request fields.
       */
    }
  }

  throw new AppError(
    "VALIDATION_ERROR",
    "Trigger ID is required. Use ?triggerId=<trigger UUID> in the webhook URL.",
    400,
  );
}

/**
 * Load a workflow trigger by ID.
 */
async function loadWebhookTrigger(
  triggerId: string,
): Promise<WorkflowTriggerRow> {
  const row = await queryOne<WorkflowTriggerRow>(
    `SELECT id, workflow_id, type, enabled, config
     FROM workflow_triggers
     WHERE id = $1`,
    [triggerId],
  );

  if (!row) {
    throw new AppError(
      "NOT_FOUND",
      "Webhook trigger not found",
      404,
    );
  }

  if (row.type !== "webhook") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Trigger is not a webhook trigger",
      400,
    );
  }

  if (!row.enabled) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Webhook trigger is disabled",
      400,
    );
  }

  return row;
}

/**
 * Read webhook payload.
 *
 * Nhost/Express may already have parsed req.body.
 * Fetch-style req.json() is used only as a fallback.
 */
async function readTriggerPayload(
  req: NhostRequest,
  headers: Record<string, string | undefined>,
): Promise<Record<string, unknown>> {
  const contentType =
    headers["content-type"] ?? "";

  /**
   * If Nhost/Express already parsed the body,
   * use it directly.
   */
  if (req.body !== undefined) {
    if (
      req.body &&
      typeof req.body === "object" &&
      !Array.isArray(req.body)
    ) {
      return req.body as unknown as Record<string, unknown>;
    }

    return {};
  }

  /**
   * Only attempt JSON parsing for JSON content.
   */
  if (
    !contentType
      .toLowerCase()
      .includes("application/json")
  ) {
    return {};
  }

  /**
   * Fetch-style fallback.
   */
  if (typeof req.json === "function") {
    try {
      const body = await req.json();

      if (
        body &&
        typeof body === "object" &&
        !Array.isArray(body)
      ) {
        return body as Record<string, unknown>;
      }
    } catch {
      // Ignore invalid/non-readable JSON.
    }
  }

  return {};
}

/**
 * Build JSON response.
 */
function jsonResponse(
  body: unknown,
  status: number,
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

export default async function handler(
  req: NhostRequest,
): Promise<Response> {
  /**
   * ---------------------------------------------------------
   * 1. Method validation
   * ---------------------------------------------------------
   */
  if (req.method !== "POST") {
    return jsonResponse(
      {
        message: "Method not allowed",
      },
      405,
    );
  }

  /**
   * ---------------------------------------------------------
   * 2. Normalize headers
   * ---------------------------------------------------------
   *
   * IMPORTANT:
   * Never call:
   *
   *   req.headers.entries()
   *
   * because Nhost uses Express/Node-style headers.
   */
  const headers = normalizeHeaders(
    req.headers,
  );

  try {
    /**
     * -------------------------------------------------------
     * 3. Validate webhook secret
     * -------------------------------------------------------
     */
    validateWebhookSecret(headers);

    /**
     * -------------------------------------------------------
     * 4. Extract trigger ID
     * -------------------------------------------------------
     */
    const rawTriggerId =
      extractTriggerId(req);

    /**
     * -------------------------------------------------------
     * 5. Validate UUID
     * -------------------------------------------------------
     */
    const triggerId =
      assertValidUuid(
        rawTriggerId,
        "triggerId",
      );

    /**
     * -------------------------------------------------------
     * 6. Idempotency key
     * -------------------------------------------------------
     */
    const idempotencyKey =
      headers["x-idempotency-key"] ??
      null;

    /**
     * -------------------------------------------------------
     * 7. Parse webhook payload
     * -------------------------------------------------------
     */
    const triggerPayload =
      await readTriggerPayload(
        req,
        headers,
      );

    /**
     * -------------------------------------------------------
     * 8. Load webhook trigger
     * -------------------------------------------------------
     */
    const trigger =
      await loadWebhookTrigger(
        triggerId,
      );

    /**
     * -------------------------------------------------------
     * 9. Log webhook
     * -------------------------------------------------------
     */
    logger.info(
      "Webhook trigger received",
      {
        action: "webhook_trigger",
        triggerId,
        workflowId:
          trigger.workflow_id,
        idempotencyKey,
        success: true,
      },
    );

    /**
     * -------------------------------------------------------
     * 10. Execute workflow
     * -------------------------------------------------------
     */
    const result =
      await workflowEngine.triggerRun({
        workflowId:
          trigger.workflow_id,

        triggerType:
          "webhook",

        triggeredBy:
          null,

        idempotencyKey,

        triggerPayload,
      });

    /**
     * -------------------------------------------------------
     * 11. Success response
     * -------------------------------------------------------
     */
    const {
      body,
      status,
    } = successResponse({
      workflow_run_id:
        result.workflowRunId,

      status:
        result.status,

      resumed:
        result.resumed ?? false,

      message:
        result.resumed
          ? "Existing run returned (idempotent)"
          : `Workflow run ${result.status}`,
    });

    return jsonResponse(
      body,
      status,
    );
  } catch (error) {
    /**
     * -------------------------------------------------------
     * 12. Error handling
     * -------------------------------------------------------
     */
    logger.error(
      "Webhook trigger failed",
      {
        action:
          "webhook_trigger_error",

        error:
          error instanceof Error
            ? error.message
            : String(error),

        success: false,
      },
    );

    const {
      body,
      status,
    } = errorResponse(error);

    return jsonResponse(
      body,
      status,
    );
  }
}
