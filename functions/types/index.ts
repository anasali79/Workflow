export type OrgRole = "owner" | "editor" | "viewer";

export type StepType =
  | "llm_call"
  | "http_request"
  | "db_write"
  | "notify"
  | "conditional_branch"
  | "approval_gate";

export type TriggerType = "manual" | "webhook" | "scheduled" | "database_event";

export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type StepRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "paused"
  | "skipped";

export type WorkflowStatus = "draft" | "active" | "archived";

export interface Organization {
  id: string;
  name: string;
  quota_limit: number;
  quota_used: number;
  quota_period_start: Date;
}

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
}

export interface Workflow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  created_by: string;
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  position: number;
  name: string;
  type: StepType;
  config: Record<string, unknown>;
}

export interface WorkflowTrigger {
  id: string;
  workflow_id: string;
  type: TriggerType;
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  status: WorkflowRunStatus;
  triggered_by: string | null;
  trigger_type: TriggerType;
  idempotency_key: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  error: string | null;
}

export interface StepRun {
  id: string;
  workflow_run_id: string;
  workflow_step_id: string;
  status: StepRunStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  attempt_count: number;
  approved_by: string | null;
  approved_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface WorkflowContext {
  organizationId: string;
  workflowId: string;
  workflowName: string;
  workflowRunId: string;
  triggerType: TriggerType;
  triggeredBy: string | null;
  triggerPayload: Record<string, unknown>;
  steps: WorkflowStep[];
  stepOutputs: Map<number, Record<string, unknown>>;
  skipUntilPosition: number | null;
}

export interface StepHandlerResult {
  output: Record<string, unknown>;
  /** When set, engine skips steps until this position (exclusive of branch step). */
  skipUntilPosition?: number | null;
  /** Pause execution (approval gate). */
  pause?: boolean;
}

export interface TriggerRunOptions {
  workflowId: string;
  triggerType: TriggerType;
  triggeredBy?: string | null;
  idempotencyKey?: string | null;
  triggerPayload?: Record<string, unknown>;
}

export interface TriggerRunResult {
  workflowRunId: string;
  status: WorkflowRunStatus;
  resumed?: boolean;
}

export const OWNER_ONLY_STEP_TYPES: StepType[] = ["db_write", "notify"];
export const OWNER_ONLY_TRIGGER_TYPES: TriggerType[] = ["webhook"];
export const TRIGGER_ROLES: OrgRole[] = ["owner", "editor"];
export const APPROVE_ROLES: OrgRole[] = ["owner", "editor"];
