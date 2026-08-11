
/**
 * Nhost Function: webhook-trigger
 *
 * Public webhook endpoint.
 *
 * Flow:
 *
 * POST /v1/webhook-trigger?triggerId=<UUID>
 *
 *        ↓
 * validate secret
 *        ↓
 * validate trigger
 *        ↓
 * create workflow_run
 *        ↓
 * create step_runs
 *        ↓
 * return 202 immediately
 *
 * IMPORTANT:
 * This function does NOT execute the workflow synchronously.
 * This prevents Lambda/Nhost timeout when a workflow reaches
 * an approval gate.
 */

import { queryOne, withTransaction } from "../services/database/client.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

import {
  assertValidUuid,
  errorResponse,
  validateWebhookSecret,
} from "../utils/http.js";

import {
  createWorkflowRun,
  ensureStepRuns,
} from "../services/workflow-engine/repository.js";

import {
  loadWorkflowSteps,
  resolveWorkflow,
} from "../services/authorization/index.js";

import { assertQuotaAvailable } from "../services/quota/index.js";


interface WorkflowTriggerRow {
  id: string;
  workflow_id: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}


/**
 * Nhost can provide Node/Express style headers.
 * Do not use req.headers.entries().
 */
function normalizeHeaders(
  headers: unknown,
): Record<string, string | undefined> {
  if (!headers || typeof headers !== "object") {
    return {};
  }

  const result: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(
    headers as Record<string, unknown>,
  )) {
    if (Array.isArray(value)) {
      result[key.toLowerCase()] = value.join(", ");
    } else if (typeof value === "string") {
      result[key.toLowerCase()] = value;
    } else if (value != null) {
      result[key.toLowerCase()] = String(value);
    }
  }

  return result;
}


/**
 * Extract triggerId from:
 *
 * ?triggerId=<uuid>
 * ?trigger_id=<uuid>
 *
 * and also supports UUID in pathname.
 */
function extractTriggerId(url: string): string {
  /**
   * Nhost should normally provide a full URL.
   *
   * But if runtime gives only a pathname/query string,
   * create a safe base URL.
   */
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    try {
      parsedUrl = new URL(
        url,
        "https://nhost-function.local",
      );
    } catch {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid request URL",
        400,
      );
    }
  }

  const pathname = parsedUrl.pathname;

  // First try UUID from pathname.
  const pathMatch = pathname.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );

  if (pathMatch?.[1]) {
    return pathMatch[1];
  }

  // Then query parameter.
  const queryTriggerId =
    parsedUrl.searchParams.get("triggerId") ??
    parsedUrl.searchParams.get("trigger_id");

  if (queryTriggerId) {
    return queryTriggerId;
  }

  throw new AppError(
    "VALIDATION_ERROR",
    "triggerId is required",
    400,
  );
}


/**
 * Load and validate webhook trigger.
 */
async function loadWebhookTrigger(
  triggerId: string,
): Promise<WorkflowTriggerRow> {
  const row = await queryOne<WorkflowTriggerRow>(
    `
      SELECT
        id,
        workflow_id,
        type,
        enabled,
        config
      FROM workflow_triggers
      WHERE id = $1
    `,
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
 * Read JSON body without depending on Headers.entries().
 */
async function readPayload(
  req: Request & { body?: unknown },
  headers: Record<string, string | undefined>,
): Promise<Record<string, unknown>> {
  // Nhost/Express may already parse req.body.
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

  const contentType =
    headers["content-type"]?.toLowerCase() ?? "";

  if (!contentType.includes("application/json")) {
    return {};
  }

  if (typeof req.json !== "function") {
    return {};
  }

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
    return {};
  }

  return {};
}


/**
 * Create a workflow run without executing it.
 */
async function createQueuedRun(
  workflowId: string,
  triggerType: string,
  triggeredBy: string | null,
  idempotencyKey: string | null,
): Promise<string> {
  const resolved = await resolveWorkflow(workflowId);

  if (resolved.workflow.status !== "active") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Workflow is not active",
      400,
    );
  }

  const steps = await loadWorkflowSteps(
    workflowId,
  );

  if (steps.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Workflow has no steps",
      400,
    );
  }

  return withTransaction(async (client) => {
    await assertQuotaAvailable(
      resolved.organizationId,
      client,
    );

    const runId = await createWorkflowRun(
      client,
      {
        workflowId,
        triggerType,
        triggeredBy,
        idempotencyKey,
      },
    );

    await ensureStepRuns(
      client,
      runId,
      steps,
    );  

    return runId;
  });
}


export default async function handler(
  req: Request & {
    headers:
      | Headers
      | Record<string, string | string[] | undefined>;
    body?: unknown;
  },
): Promise<Response> {

  // ---------------------------------------------------------
  // Method
  // ---------------------------------------------------------

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          Allow: "POST",
        },
      },
    );
  }


  // ---------------------------------------------------------
  // Normalize headers
  // ---------------------------------------------------------

  const headers = normalizeHeaders(
    req.headers,
  );


  try {
    // -------------------------------------------------------
    // 1. Webhook secret
    // -------------------------------------------------------

    validateWebhookSecret(headers);


    // -------------------------------------------------------
    // 2. Trigger ID
    // -------------------------------------------------------

    const rawTriggerId =
      extractTriggerId(req.url);

    const triggerId =
      assertValidUuid(
        rawTriggerId,
        "triggerId",
      );


    // -------------------------------------------------------
    // 3. Idempotency
    // -------------------------------------------------------

    const idempotencyKey =
      headers["x-idempotency-key"] ??
      null;


    // -------------------------------------------------------
    // 4. Trigger payload
    // -------------------------------------------------------

    const triggerPayload =
      await readPayload(
        req,
        headers,
      );


    // -------------------------------------------------------
    // 5. Validate trigger
    // -------------------------------------------------------

    const trigger =
      await loadWebhookTrigger(
        triggerId,
      );


    // -------------------------------------------------------
    // 6. Existing idempotent run
    // -------------------------------------------------------

    if (idempotencyKey) {
      const existing =
        await queryOne<{
          id: string;
          status: string;
        }>(
          `
            SELECT
              id,
              status
            FROM workflow_runs
            WHERE workflow_id = $1
              AND idempotency_key = $2
            LIMIT 1
          `,
          [
            trigger.workflow_id,
            idempotencyKey,
          ],
        );

      if (existing) {
        logger.info(
          "Webhook idempotent request",
          {
            triggerId,
            workflowId: trigger.workflow_id,
            workflowRunId: existing.id,
            status: existing.status,
            action: "webhook_trigger",
            success: true,
          },
        );

        return new Response(
          JSON.stringify({
            success: true,
            workflow_run_id: existing.id,
            status: existing.status,
            resumed: false,
            message:
              "Existing workflow run returned",
          }),
          {
            status: 200,
            headers: {
              "Content-Type":
                "application/json",
            },
          },
        );
      }
    }


    // -------------------------------------------------------
    // 7. Create DB run
    //
    // IMPORTANT:
    // We do NOT executeRun() here.
    // -------------------------------------------------------

    const workflowRunId =
      await createQueuedRun(
        trigger.workflow_id,
        "webhook",
        null,
        idempotencyKey,
      );


    logger.info(
      "Webhook workflow run queued",
      {
        
        triggerId,
        workflowId:
          trigger.workflow_id,
        workflowRunId,
        idempotencyKey,
        payloadReceived:
          Object.keys(triggerPayload).length > 0,
        action: "webhook_trigger",
        success: true,
      },
    );


    // -------------------------------------------------------
    // 8. Return immediately
    // -------------------------------------------------------

    return new Response(
      JSON.stringify({
        success: true,
        workflow_run_id:
          workflowRunId,
        status: "queued",
        message:
          "Workflow accepted for execution",
      }),
      {
        status: 202,
        headers: {
          "Content-Type":
            "application/json",
        },
      },
    );

  } catch (error) {

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


    return new Response(
      JSON.stringify(body),
      {
        status,
        headers: {
          "Content-Type":
            "application/json",
        },
      },
    );
  }
}
