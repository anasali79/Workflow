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
 *   - Does NOT trust client-submitted workflowId or orgId — all resolved via triggerId
 *   - Idempotency: if x-idempotency-key header present, deduplicates runs
 *   - SSRF: webhook trigger invokes the engine, which uses the SSRF guard
 *     for any http_request steps inside the workflow
 *
 * Idempotency:
 *   Callers may retry the webhook with the same X-Idempotency-Key header.
 *   The engine checks webhook_idempotency table and returns the existing
 *   run rather than creating a duplicate.
 *
 * Note: This is registered as an Nhost Function. In Nhost, functions
 * can handle path params by parsing the URL manually.
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

/**
 * Load a workflow trigger by ID, ensuring it is enabled and of type 'webhook'.
 */
async function loadWebhookTrigger(triggerId: string): Promise<WorkflowTriggerRow> {
  const row = await queryOne<WorkflowTriggerRow>(
    `SELECT id, workflow_id, type, enabled, config
     FROM workflow_triggers
     WHERE id = $1`,
    [triggerId],
  );

  if (!row) {
    throw new AppError("NOT_FOUND", "Webhook trigger not found", 404);
  }
  if (row.type !== "webhook") {
    throw new AppError("VALIDATION_ERROR", "Trigger is not a webhook trigger", 400);
  }
  if (!row.enabled) {
    throw new AppError("VALIDATION_ERROR", "Webhook trigger is disabled", 400);
  }

  return row;
}

/**
 * Extract the triggerId from the URL path:
 *   /webhook/workflow/<triggerId>
 */
function extractTriggerId(url: string): string {
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname;
  
  // 1. Try matching UUID in pathname
  const match = pathname.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (match?.[1]) {
    return match[1];
  }

  // 2. Try query params
  const fromQuery = parsedUrl.searchParams.get("triggerId") || parsedUrl.searchParams.get("trigger_id");
  if (fromQuery) {
    return fromQuery;
  }

  throw new AppError("VALIDATION_ERROR", "Trigger ID missing from URL path or query parameters", 400);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers = Object.fromEntries(req.headers.entries());

  try {
    // 1. Validate webhook secret
    validateWebhookSecret(headers);

    // 2. Extract and validate trigger ID from URL
    const rawTriggerId = extractTriggerId(req.url);
    const triggerId = assertValidUuid(rawTriggerId, "triggerId");

    // 3. Parse idempotency key (optional)
    const idempotencyKey =
      (headers["x-idempotency-key"] as string | undefined) ||
      (headers["X-Idempotency-Key"] as string | undefined) ||
      null;

    // 4. Parse request body as trigger payload (could be any JSON)
    let triggerPayload: Record<string, unknown> = {};
    try {
      const contentType = headers["content-type"] ?? "";
      if (contentType.includes("application/json")) {
        const body = await req.json();
        if (body && typeof body === "object" && !Array.isArray(body)) {
          triggerPayload = body as Record<string, unknown>;
        }
      }
    } catch {
      // Non-JSON body is fine — payload defaults to {}
    }

    // 5. Resolve and validate the webhook trigger
    const trigger = await loadWebhookTrigger(triggerId);

    logger.info("Webhook trigger received", {
      action: "webhook_trigger",
      triggerId,
      workflowId: trigger.workflow_id,
      idempotencyKey,
      success: true,
    });

    // 6. Execute via the shared engine (same path as manual / scheduled / db_event)
    const result = await workflowEngine.triggerRun({
      workflowId: trigger.workflow_id,
      triggerType: "webhook",
      triggeredBy: null, // No authenticated user for external webhooks
      idempotencyKey,
      triggerPayload,
    });

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
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const { body, status } = errorResponse(error);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
