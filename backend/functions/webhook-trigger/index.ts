/**
 * Nhost Function: webhook-trigger
 *
 * Handles public webhook invocations for workflows that have a `webhook` trigger.
 *
 * Endpoint:
 *   POST /webhook/workflow/:triggerId
 *
 * Security:
 *   - Validates x-webhook-secret header (WEBHOOK_SECRET env var)
 *   - Validates trigger exists and is enabled
 *   - Verifies trigger type is 'webhook'
 *   - Does NOT trust client-submitted workflowId or orgId
 *   - Idempotency: if x-idempotency-key header present, deduplicates runs
 *   - SSRF protection is handled by the workflow engine
 */

import { queryOne } from "../../services/database/client.js";
import { workflowEngine } from "../../services/workflow-engine/engine.js";
import { AppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
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
type HeaderMap = Record<string, HeaderValue>;

/**
 * Normalize Nhost/Express headers into a plain object.
 *
 * Nhost Functions run through an Express-based wrapper, so req.headers
 * may be a plain Node/Express IncomingHttpHeaders object rather than
 * the Fetch API Headers class.
 */
function normalizeHeaders(headers: unknown): Record<string, string | undefined> {
  if (!headers) {
    return {};
  }

  // Native Fetch Headers
  if (
    typeof headers === "object" &&
    headers !== null &&
    typeof (headers as { entries?: unknown }).entries === "function"
  ) {
    return Object.fromEntries(
      Array.from(
        (headers as Headers).entries(),
      ),
    );
  }

  // Express / Node headers
  const rawHeaders = headers as HeaderMap;

  const normalized: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(rawHeaders)) {
    if (Array.isArray(value)) {
      normalized[key.toLowerCase()] = value.join(", ");
    } else if (typeof value === "string") {
      normalized[key.toLowerCase()] = value;
    } else {
      normalized[key.toLowerCase()] = undefined;
    }
  }

  return normalized;
}

/**
 * Load a workflow trigger by ID,
 * ensuring it is enabled and of type 'webhook'.
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
 * Extract triggerId from URL.
 *
 * Supported:
 *   /webhook/workflow/<triggerId>
 *   /webhook/workflow/<triggerId>?...
 *   ?triggerId=<triggerId>
 *   ?trigger_id=<triggerId>
 */
function extractTriggerId(url: string): string {
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname;

  // Try UUID from pathname first.
  const match = pathname.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );

  if (match?.[1]) {
    return match[1];
  }

  // Fallback to query params.
  const fromQuery =
    parsedUrl.searchParams.get("triggerId") ||
    parsedUrl.searchParams.get("trigger_id");

  if (fromQuery) {
    return fromQuery;
  }

  throw new AppError(
    "VALIDATION_ERROR",
    "Trigger ID missing from URL path or query parameters",
    400,
  );
}

/**
 * Safely read request body.
 *
 * Supports both:
 * - Fetch Request: req.json()
 * - Express/Nhost request: req.body
 */
async function readTriggerPayload(
  req: Request & {
    body?: unknown;
  },
  headers: Record<string, string | undefined>,
): Promise<Record<string, unknown>> {
  const contentType = headers["content-type"] ?? "";

  // JSON request
  if (contentType.toLowerCase().includes("application/json")) {
    // Express/Nhost runtime may already have parsed the body.
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

    // Fetch-style fallback.
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
        // Invalid/non-readable JSON.
      }
    }
  }

  return {};
}

export default async function handler(
  req: Request & {
    headers: Headers | Record<string, string | string[] | undefined>;
    body?: unknown;
  },
): Promise<Response> {
  // Only POST is supported.
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        message: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  /**
   * IMPORTANT:
   *
   * Do NOT call:
   *   req.headers.entries()
   *
   * Nhost's runtime uses Express/Node-style headers.
   */
  const headers = normalizeHeaders(req.headers);

  try {
    // ---------------------------------------------------------
    // 1. Validate webhook secret
    // ---------------------------------------------------------
    validateWebhookSecret(headers);

    // ---------------------------------------------------------
    // 2. Extract and validate trigger ID
    // ---------------------------------------------------------
    const rawTriggerId = extractTriggerId(req.url);

    const triggerId = assertValidUuid(
      rawTriggerId,
      "triggerId",
    );

    // ---------------------------------------------------------
    // 3. Parse idempotency key
    // ---------------------------------------------------------
    const idempotencyKey =
      headers["x-idempotency-key"] ?? null;

    // ---------------------------------------------------------
    // 4. Parse webhook payload
    // ---------------------------------------------------------
    const triggerPayload = await readTriggerPayload(
      req,
      headers,
    );

    // ---------------------------------------------------------
    // 5. Load and validate webhook trigger
    // ---------------------------------------------------------
    const trigger = await loadWebhookTrigger(triggerId);

    // ---------------------------------------------------------
    // 6. Log webhook invocation
    // ---------------------------------------------------------
    logger.info("Webhook trigger received", {
      action: "webhook_trigger",
      triggerId,
      workflowId: trigger.workflow_id,
      idempotencyKey,
      success: true,
    });

    // ---------------------------------------------------------
    // 7. Execute workflow
    // ---------------------------------------------------------
    const result = await workflowEngine.triggerRun({
      workflowId: trigger.workflow_id,
      triggerType: "webhook",
      triggeredBy: null,
      idempotencyKey,
      triggerPayload,
    });

    // ---------------------------------------------------------
    // 8. Build success response
    // ---------------------------------------------------------
    const { body, status } = successResponse({
      workflow_run_id: result.workflowRunId,
      status: result.status,
      resumed: result.resumed ?? false,
      message: result.resumed
        ? "Existing run returned (idempotent)"
        : `Workflow run ${result.status}`,
    });

    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    // ---------------------------------------------------------
    // Error handling
    // ---------------------------------------------------------
    logger.error("Webhook trigger failed", {
      action: "webhook_trigger_error",
      error: error instanceof Error
        ? error.message
        : String(error),
    });

    const { body, status } = errorResponse(error);

    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}