import type { OrgMember, OrgRole, StepType, TriggerType, Workflow, WorkflowRun, WorkflowStep } from "../../types/index.js";
import {
  APPROVE_ROLES,
  OWNER_ONLY_STEP_TYPES,
  OWNER_ONLY_TRIGGER_TYPES,
  TRIGGER_ROLES,
} from "../../types/index.js";
import { AppError } from "../../utils/errors.js";
import { queryOne } from "../database/client.js";

export interface WorkflowResolution {
  workflow: Workflow;
  organizationId: string;
}

export interface StepRunResolution {
  stepRunId: string;
  stepRunStatus: string;
  workflowRunId: string;
  workflowRunStatus: string;
  stepType: StepType;
  stepPosition: number;
  workflowId: string;
  organizationId: string;
}

export async function getOrgMembership(
  userId: string,
  organizationId: string,
): Promise<OrgMember | null> {
  return queryOne<OrgMember>(
    `SELECT id, organization_id, user_id, role
     FROM org_members
     WHERE user_id = $1 AND organization_id = $2`,
    [userId, organizationId],
  );
}

export async function resolveWorkflow(workflowId: string): Promise<WorkflowResolution> {
  const row = await queryOne<Workflow>(
    `SELECT id, organization_id, name, description, status, created_by
     FROM workflows WHERE id = $1`,
    [workflowId],
  );
  if (!row) {
    throw new AppError("NOT_FOUND", "Workflow not found", 404);
  }
  return { workflow: row, organizationId: row.organization_id };
}

export async function resolveStepRun(stepRunId: string): Promise<StepRunResolution> {
  const row = await queryOne<{
    step_run_id: string;
    step_run_status: string;
    workflow_run_id: string;
    workflow_run_status: string;
    step_type: StepType;
    step_position: number;
    workflow_id: string;
    organization_id: string;
  }>(
    `SELECT
       sr.id AS step_run_id,
       sr.status AS step_run_status,
       wr.id AS workflow_run_id,
       wr.status AS workflow_run_status,
       ws.type AS step_type,
       ws.position AS step_position,
       w.id AS workflow_id,
       w.organization_id
     FROM step_runs sr
     INNER JOIN workflow_runs wr ON wr.id = sr.workflow_run_id
     INNER JOIN workflow_steps ws ON ws.id = sr.workflow_step_id
     INNER JOIN workflows w ON w.id = wr.workflow_id
     WHERE sr.id = $1`,
    [stepRunId],
  );

  if (!row) {
    throw new AppError("NOT_FOUND", "Step run not found", 404);
  }

  return {
    stepRunId: row.step_run_id,
    stepRunStatus: row.step_run_status,
    workflowRunId: row.workflow_run_id,
    workflowRunStatus: row.workflow_run_status,
    stepType: row.step_type,
    stepPosition: row.step_position,
    workflowId: row.workflow_id,
    organizationId: row.organization_id,
  };
}

export function assertRoleAllowed(role: OrgRole, allowed: OrgRole[], message: string): void {
  if (!allowed.includes(role)) {
    throw new AppError("FORBIDDEN", message, 403);
  }
}

export async function assertCanTriggerWorkflow(userId: string, workflowId: string): Promise<WorkflowResolution> {
  const resolved = await resolveWorkflow(workflowId);
  if (resolved.workflow.status !== "active") {
    throw new AppError("VALIDATION_ERROR", "Workflow is not active", 400);
  }
  const member = await getOrgMembership(userId, resolved.organizationId);
  if (!member) {
    throw new AppError("FORBIDDEN", "Not a member of this organization", 403);
  }
  assertRoleAllowed(member.role, TRIGGER_ROLES, "Only owners and editors can trigger workflows");
  return resolved;
}

export async function assertCanApproveStep(userId: string, stepRunId: string): Promise<StepRunResolution> {
  const resolved = await resolveStepRun(stepRunId);
  const member = await getOrgMembership(userId, resolved.organizationId);
  if (!member) {
    throw new AppError("FORBIDDEN", "Not a member of this organization", 403);
  }
  assertRoleAllowed(member.role, APPROVE_ROLES, "Only owners and editors can approve steps");

  if (resolved.stepType !== "approval_gate") {
    throw new AppError("VALIDATION_ERROR", "Step is not an approval gate", 400);
  }
  if (resolved.stepRunStatus !== "paused") {
    throw new AppError("CONFLICT", "Step is not awaiting approval", 409);
  }
  if (resolved.workflowRunStatus !== "paused") {
    throw new AppError("CONFLICT", "Workflow run is not paused", 409);
  }

  return resolved;
}

export function assertCanAddStepType(role: OrgRole, stepType: StepType): void {
  if (OWNER_ONLY_STEP_TYPES.includes(stepType) && role !== "owner") {
    throw new AppError("FORBIDDEN", `Only owners can add ${stepType} steps`, 403);
  }
}

export function assertCanAddTriggerType(role: OrgRole, triggerType: TriggerType): void {
  if (OWNER_ONLY_TRIGGER_TYPES.includes(triggerType) && role !== "owner") {
    throw new AppError("FORBIDDEN", `Only owners can add ${triggerType} triggers`, 403);
  }
}

export async function loadWorkflowSteps(workflowId: string): Promise<WorkflowStep[]> {
  const { query } = await import("../database/client.js");
  const result = await query<WorkflowStep>(
    `SELECT id, workflow_id, position, name, type, config
     FROM workflow_steps
     WHERE workflow_id = $1
     ORDER BY position ASC`,
    [workflowId],
  );
  return result.rows.map((row) => ({ ...row, config: row.config ?? {} }));
}

export async function loadWorkflowRun(runId: string): Promise<WorkflowRun> {
  const row = await queryOne<WorkflowRun>(
    `SELECT id, workflow_id, status, triggered_by, trigger_type, idempotency_key,
            started_at, completed_at, error
     FROM workflow_runs WHERE id = $1`,
    [runId],
  );
  if (!row) throw new AppError("NOT_FOUND", "Workflow run not found", 404);
  return row;
}
