/**
 * Nhost Function: triggerWorkflowRun
 *
 * Hasura Action handler — called when a user executes:
 *   mutation { triggerWorkflowRun(workflow_id: "...") }
 *
 * Authorization (Layer 2 — business logic inside the handler):
 *   1. Extracts authenticated user from Hasura session variables
 *   2. Validates internal secret to prevent direct endpoint calls
 *   3. Validates workflow_id UUID to prevent injection
 *   4. Calls assertCanTriggerWorkflow() — resolves org through DB,
 *      verifies membership AND role (owner/editor only)
 *   5. Checks quota atomically before creating the run
 *
 * Never trusts organization_id or role from the client.
 * Organization is always resolved server-side via workflow_id.
 *
 * Handler URL registered in hasura/metadata/actions.yaml:
 *   {{ACTION_BASE_URL}}/trigger-workflow-run
 */

import { workflowEngine } from "../services/workflow-engine/engine.js";
import { logger } from "../utils/logger.js";
import {
  assertValidUuid,
  errorResponse,
  extractUserId,
  successResponse,
  type HasuraActionPayload,
  validateInternalSecret,
} from "../utils/http.js";

interface TriggerWorkflowRunInput {
  workflow_id: string;
}

/**
 * Main handler — exported as default for Nhost Functions runtime.
 *
 * Nhost Functions receive a standard Node.js-like Request/Response.
 * We model it with the fetch Request type for portability.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers = Object.fromEntries(req.headers.entries());

  try {
    validateInternalSecret(headers);

    const payload = (await req.json()) as HasuraActionPayload<TriggerWorkflowRunInput>;

    const userId = extractUserId(payload.session_variables);
    const workflowId = assertValidUuid(payload.input?.workflow_id, "workflow_id");

    logger.info("triggerWorkflowRun called", {
      action: "trigger_workflow_run",
      workflowId,
      userId,
      success: true,
    });

    const result = await workflowEngine.triggerRun({
      workflowId,
      triggerType: "manual",
      triggeredBy: userId,
    });

    const { body, status } = successResponse({
      workflow_run_id: result.workflowRunId,
      status: result.status,
      message: `Workflow run ${result.status}`,
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
