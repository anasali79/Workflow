/**
 * Nhost Function: approveStep
 *
 * Hasura Action handler — called when a user executes:
 *   mutation { approveStep(step_run_id: "...", comment: "...") }
 *
 * Full 10-point authorization checklist (Layer 2 business logic):
 *   1.  Validate internal secret (prevent direct endpoint invocation)
 *   2.  Extract user from Hasura session variables (never trust client)
 *   3.  Validate step_run_id UUID
 *   4.  Resolve step_run → workflow_run → workflow → organization (via DB)
 *   5.  Verify approver is a member of that organization
 *   6.  Verify approver role is owner or editor
 *   7.  Verify step type is approval_gate
 *   8.  Verify step_run status is 'paused'
 *   9.  Verify workflow_run status is 'paused'
 *   10. Acquire FOR UPDATE lock to prevent race conditions / double-approval
 *
 * All of steps 4-10 run inside resumeAfterApproval(), which delegates
 * to assertCanApproveStep() and lockPausedStepRun() inside a transaction.
 *
 * Handler URL registered in hasura/metadata/actions.yaml:
 *   {{ACTION_BASE_URL}}/approve-step
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

interface ApproveStepInput {
  step_run_id: string;
  comment?: string | null;
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
    validateInternalSecret(headers);

    const payload = (await req.json()) as HasuraActionPayload<ApproveStepInput>;

    const userId = extractUserId(payload.session_variables);
    const stepRunId = assertValidUuid(payload.input?.step_run_id, "step_run_id");

    logger.info("approveStep called", {
      action: "approve_step",
      stepRunId,
      userId,
      success: true,
    });

    // resumeAfterApproval() performs all 10 authorization checks listed above,
    // records approved_by/approved_at, then resumes the engine from the next step.
    const result = await workflowEngine.resumeAfterApproval(stepRunId, userId);

    const { body, status } = successResponse({
      step_run_id: stepRunId,
      workflow_run_id: result.workflowRunId,
      status: result.status,
      message: `Approval recorded. Workflow run ${result.status}.`,
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
