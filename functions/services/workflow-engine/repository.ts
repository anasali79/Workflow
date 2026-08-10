import type { StepRun, StepRunStatus, TriggerType, WorkflowRunStatus, WorkflowStep } from "../../types/index.js";
import type pg from "pg";
import { query, queryOne, withTransaction } from "../database/client.js";

export async function findExistingRunByIdempotency(
  workflowId: string,
  idempotencyKey: string,
): Promise<{ id: string; status: WorkflowRunStatus } | null> {
  return queryOne(
    `SELECT id, status FROM workflow_runs
     WHERE workflow_id = $1 AND idempotency_key = $2`,
    [workflowId, idempotencyKey],
  );
}

export async function createWorkflowRun(
  client: pg.PoolClient,
  params: {
    workflowId: string;
    triggerType: TriggerType;
    triggeredBy?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO workflow_runs (workflow_id, status, triggered_by, trigger_type, idempotency_key)
     VALUES ($1, 'pending', $2, $3, $4)
     RETURNING id`,
    [params.workflowId, params.triggeredBy ?? null, params.triggerType, params.idempotencyKey ?? null],
  );
  return result.rows[0].id;
}

export async function ensureStepRuns(
  client: pg.PoolClient,
  workflowRunId: string,
  steps: WorkflowStep[],
): Promise<void> {
  for (const step of steps) {
    await client.query(
      `INSERT INTO step_runs (workflow_run_id, workflow_step_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (workflow_run_id, workflow_step_id) DO NOTHING`,
      [workflowRunId, step.id],
    );
  }
}

export async function loadStepRunsForRun(workflowRunId: string): Promise<
  Array<
    StepRun & {
      step_position: number;
      step_type: string;
      step_name: string;
    }
  >
> {
  const result = await query<
    StepRun & { step_position: number; step_type: string; step_name: string }
  >(
    `SELECT sr.*, ws.position AS step_position, ws.type AS step_type, ws.name AS step_name
     FROM step_runs sr
     INNER JOIN workflow_steps ws ON ws.id = sr.workflow_step_id
     WHERE sr.workflow_run_id = $1
     ORDER BY ws.position ASC`,
    [workflowRunId],
  );
  return result.rows;
}

export async function updateWorkflowRunStatus(
  client: pg.PoolClient | null,
  workflowRunId: string,
  status: WorkflowRunStatus,
  fields?: { error?: string | null; started_at?: Date; completed_at?: Date },
): Promise<void> {
  const runner = client ? client.query.bind(client) : query;
  await runner(
    `UPDATE workflow_runs
     SET status = $2,
         error = COALESCE($3, error),
         started_at = COALESCE($4, started_at),
         completed_at = COALESCE($5, completed_at),
         updated_at = NOW()
     WHERE id = $1`,
    [
      workflowRunId,
      status,
      fields?.error ?? null,
      fields?.started_at ?? null,
      fields?.completed_at ?? null,
    ],
  );
}

export async function updateStepRun(
  client: pg.PoolClient | null,
  stepRunId: string,
  patch: {
    status?: StepRunStatus;
    input?: Record<string, unknown> | null;
    output?: Record<string, unknown> | null;
    error?: string | null;
    attempt_count?: number;
    approved_by?: string | null;
    approved_at?: Date | null;
    started_at?: Date | null;
    completed_at?: Date | null;
  },
): Promise<void> {
  const runner = client ? client.query.bind(client) : query;
  await runner(
    `UPDATE step_runs SET
       status = COALESCE($2, status),
       input = COALESCE($3, input),
       output = COALESCE($4, output),
       error = COALESCE($5, error),
       attempt_count = COALESCE($6, attempt_count),
       approved_by = COALESCE($7, approved_by),
       approved_at = COALESCE($8, approved_at),
       started_at = COALESCE($9, started_at),
       completed_at = COALESCE($10, completed_at),
       updated_at = NOW()
     WHERE id = $1`,
    [
      stepRunId,
      patch.status ?? null,
      patch.input !== undefined ? patch.input : null,
      patch.output !== undefined ? patch.output : null,
      patch.error ?? null,
      patch.attempt_count ?? null,
      patch.approved_by ?? null,
      patch.approved_at ?? null,
      patch.started_at ?? null,
      patch.completed_at ?? null,
    ],
  );
}

export async function lockPausedStepRun(
  client: pg.PoolClient,
  stepRunId: string,
): Promise<{ id: string; status: string; workflow_run_id: string } | null> {
  const result = await client.query<{ id: string; status: string; workflow_run_id: string }>(
    `SELECT id, status, workflow_run_id
     FROM step_runs
     WHERE id = $1 AND status = 'paused'
     FOR UPDATE`,
    [stepRunId],
  );
  return result.rows[0] ?? null;
}

export async function insertWorkflowArtifact(
  params: { organizationId: string; workflowRunId: string; content: Record<string, unknown> },
  client?: pg.PoolClient,
): Promise<string> {
  const sql = `INSERT INTO workflow_artifacts (organization_id, workflow_run_id, content)
     VALUES ($1, $2, $3)
     RETURNING id`;
  const values = [params.organizationId, params.workflowRunId, JSON.stringify(params.content)];

  if (client) {
    const result = await client.query<{ id: string }>(sql, values);
    return result.rows[0].id;
  }

  const result = await query<{ id: string }>(sql, values);
  return result.rows[0].id;
}

export { withTransaction };
