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
 * execute workflow
 *        ↓
 * approval_gate => paused
 *        ↓
 * return result
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

import { workflowEngine } from "../services/workflow-engine/engine.js";

interface WorkflowTriggerRow {
  id: string;
  workflow_id: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

/**
 * Normalize headers so the function works with
 * Headers and Express/Nhost-style header objects.
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
 * Also supports UUID inside pathname.
 */
function extractTriggerId(url: string): string {
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

  // UUID inside pathname.
  const pathMatch = pathname.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );

  if (pathMatch?.[1]) {
    return pathMatch[1];
  }

  // UUID from query parameter.
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
 * Read webhook JSON body.
 *
 * Supports:
 * - Nhost/Express parsed req.body
 * - Request.json()
 */
async function readPayload(
  req: Request & { body?: unknown },
  headers: Record<string, string | undefined>,
): Promise<Record<string, unknown>> {
  // Body already parsed by runtime.
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

  // No JSON body.
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
 * Create workflow run and step runs.
 */
async function createWorkflowRunForWebhook(
  workflowId: string,
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

  const steps = await loadWorkflowSteps(workflowId);

  if (steps.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Workflow has no steps",
      400,
    );
  }

  return withTransaction(async (client) => {
    // Quota is checked before creating the run.
    await assertQuotaAvailable(
      resolved.organizationId,
      client,
    );

    const runId = await createWorkflowRun(
      client,
      {
        workflowId,
        triggerType: "webhook",
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

/**
 * Nhost Function handler.
 */
export default async function handler(
  req: Request & {
    headers:
      | Headers
      | Record<string, string | string[] | undefined>;

    body?: unknown;
  },
): Promise<Response> {
  // ---------------------------------------------------------
  // 1. HTTP method
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
  // 2. Normalize headers
  // ---------------------------------------------------------

  const headers = normalizeHeaders(req.headers);

  try {
    // -------------------------------------------------------
    // 3. Validate webhook secret
    // -------------------------------------------------------

    validateWebhookSecret(headers);

    // -------------------------------------------------------
    // 4. Extract trigger ID
    // -------------------------------------------------------

    const rawTriggerId = extractTriggerId(req.url);

    const triggerId = assertValidUuid(
      rawTriggerId,
      "triggerId",
    );

    // -------------------------------------------------------
    // 5. Idempotency key
    // -------------------------------------------------------

    const idempotencyKey =
      headers["x-idempotency-key"] ?? null;

    // -------------------------------------------------------
    // 6. Read webhook payload
    // -------------------------------------------------------

    const triggerPayload = await readPayload(
      req,
      headers,
    );

    // -------------------------------------------------------
    // 7. Load webhook trigger
    // -------------------------------------------------------

    const trigger = await loadWebhookTrigger(
      triggerId,
    );

    logger.info("Webhook trigger received", {
      triggerId,
      workflowId: trigger.workflow_id,
      idempotencyKey,
      payloadReceived:
        Object.keys(triggerPayload).length > 0,
      action: "webhook_trigger",
      success: true,
    });

    // -------------------------------------------------------
    // 8. Idempotency check
    // -------------------------------------------------------

    if (idempotencyKey) {
      const existing = await queryOne<{
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
    // 9. Create workflow run
    // -------------------------------------------------------

    const workflowRunId =
      await createWorkflowRunForWebhook(
        trigger.workflow_id,
        null,
        idempotencyKey,
      );

    logger.info(
      "Webhook workflow run created",
      {
        triggerId,
        workflowId: trigger.workflow_id,
        workflowRunId,
        idempotencyKey,
        action: "webhook_trigger",
        success: true,
      },
    );

    // -------------------------------------------------------
    // 10. Execute workflow
    //
    // IMPORTANT:
    // We await execution instead of creating an unresolved
    // background Promise. This prevents the Nhost/Lambda
    // Runtime.NodeJsExit problem.
    //
    // If workflow reaches approval_gate,
    // executeRun() returns "paused".
    // -------------------------------------------------------

    const executionStatus =
      await workflowEngine.executeRun(
        workflowRunId,
        triggerPayload,
      );

    // -------------------------------------------------------
    // 11. Return execution result
    // -------------------------------------------------------

    logger.info(
      "Webhook workflow execution finished",
      {
        triggerId,
        workflowId: trigger.workflow_id,
        workflowRunId,
        status: executionStatus,
        action: "webhook_trigger_complete",
        success: true,
      },
    );

    return new Response(
      JSON.stringify({
        success: true,
        workflow_run_id: workflowRunId,
        status: executionStatus,
        message:
          executionStatus === "paused"
            ? "Workflow paused and awaiting approval"
            : executionStatus === "completed"
              ? "Workflow completed successfully"
              : "Workflow execution finished",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    // -------------------------------------------------------
    // 12. Error handling
    // -------------------------------------------------------

    logger.error(
      "Webhook trigger failed",
      {
        action: "webhook_trigger_error",
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