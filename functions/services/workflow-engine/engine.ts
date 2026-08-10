import type { TriggerRunOptions, TriggerRunResult, WorkflowContext, WorkflowRunStatus } from "../../types/index.js";
import { AppError, isAppError, toClientError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { assertCanTriggerWorkflow, loadWorkflowRun, loadWorkflowSteps, resolveWorkflow } from "../authorization/index.js";
import { assertQuotaAvailable } from "../quota/index.js";
import { withTransaction } from "../database/client.js";
import { createStepHandlers } from "./handlers/index.js";
import {
  createWorkflowRun,
  ensureStepRuns,
  findExistingRunByIdempotency,
  loadStepRunsForRun,
  lockPausedStepRun,
  updateStepRun,
  updateWorkflowRunStatus,
} from "./repository.js";

export class WorkflowEngine {
  private readonly handlers = createStepHandlers();

  /** Shared entry for manual, webhook, scheduled, and database_event triggers. */
  async triggerRun(options: TriggerRunOptions): Promise<TriggerRunResult> {
    const start = Date.now();
    const { workflowId, triggerType, triggeredBy, idempotencyKey, triggerPayload = {} } = options;

    if (idempotencyKey) {
      const existing = await findExistingRunByIdempotency(workflowId, idempotencyKey);
      if (existing) {
        logger.info("Idempotent workflow run returned existing", {
          workflowId,
          workflowRunId: existing.id,
          action: "trigger_run",
          success: true,
        });
        return { workflowRunId: existing.id, status: existing.status, resumed: false };
      }
    }

    const resolved = triggeredBy
      ? await assertCanTriggerWorkflow(triggeredBy, workflowId)
      : await resolveWorkflow(workflowId);

    if (resolved.workflow.status !== "active") {
      throw new AppError("VALIDATION_ERROR", "Workflow is not active", 400);
    }

    const steps = await loadWorkflowSteps(workflowId);

    const workflowRunId = await withTransaction(async (client) => {
      await assertQuotaAvailable(resolved.organizationId, client);
      const runId = await createWorkflowRun(client, {
        workflowId,
        triggerType,
        triggeredBy,
        idempotencyKey,
      });
      await ensureStepRuns(client, runId, steps);
      return runId;
    });

    logger.info("Workflow run created", {
      organizationId: resolved.organizationId,
      workflowId,
      workflowRunId,
      action: "trigger_run",
      durationMs: Date.now() - start,
      success: true,
    });

    const status = await this.executeRun(workflowRunId, triggerPayload);
    return { workflowRunId, status: status as WorkflowRunStatus };
  }

  /** Resume execution after approval gate. */
  async resumeAfterApproval(stepRunId: string, approvedBy: string): Promise<TriggerRunResult> {
    const { assertCanApproveStep } = await import("../authorization/index.js");

    const resolved = await assertCanApproveStep(approvedBy, stepRunId);

    await withTransaction(async (client) => {
      const locked = await lockPausedStepRun(client, stepRunId);
      if (!locked) {
        throw new AppError("CONFLICT", "Step is not awaiting approval or was already approved", 409);
      }

      await updateStepRun(client, stepRunId, {
        status: "completed",
        approved_by: approvedBy,
        approved_at: new Date(),
        output: { approved: true, approvedBy },
        completed_at: new Date(),
      });

      await updateWorkflowRunStatus(client, resolved.workflowRunId, "running");
    });

    const status = await this.executeRun(resolved.workflowRunId);
    return { workflowRunId: resolved.workflowRunId, status: status as WorkflowRunStatus, resumed: true };
  }

  /** Execute (or resume) all steps for a workflow run. */
  async executeRun(workflowRunId: string, triggerPayload: Record<string, unknown> = {}): Promise<string> {
    const started = Date.now();
    const stepRuns = await loadStepRunsForRun(workflowRunId);
    if (stepRuns.length === 0) {
      throw new AppError("NOT_FOUND", "No step runs found for workflow run", 404);
    }

    const run = await loadWorkflowRun(workflowRunId);
    const { workflow, organizationId } = await resolveWorkflow(run.workflow_id);
    const steps = await loadWorkflowSteps(run.workflow_id);

    const ctx: WorkflowContext = {
      organizationId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowRunId,
      triggerType: run.trigger_type,
      triggeredBy: run.triggered_by,
      triggerPayload,
      steps,
      stepOutputs: new Map(),
      skipUntilPosition: null,
    };

    // Hydrate completed/skipped outputs for resume
    for (const sr of stepRuns) {
      if (sr.output && (sr.status === "completed" || sr.status === "skipped")) {
        ctx.stepOutputs.set(sr.step_position, sr.output as Record<string, unknown>);
      }
    }

    await updateWorkflowRunStatus(null, workflowRunId, "running", { started_at: new Date() });

    try {
      for (const stepRun of stepRuns) {
        const step = steps.find((s) => s.id === stepRun.workflow_step_id);
        if (!step) continue;

        if (stepRun.status === "completed" || stepRun.status === "skipped") {
          continue;
        }

        if (ctx.skipUntilPosition !== null && step.position >= ctx.skipUntilPosition) {
          await updateStepRun(null, stepRun.id, {
            status: "skipped",
            completed_at: new Date(),
            output: { skipped: true, reason: "conditional_branch" },
          });
          ctx.stepOutputs.set(step.position, { skipped: true });
          continue;
        }

        const handler = this.handlers.get(step.type);
        if (!handler) {
          throw new AppError("INTERNAL_ERROR", `No handler for step type ${step.type}`, 500);
        }

        const attemptCount = (stepRun.attempt_count ?? 0) + 1;
        await updateStepRun(null, stepRun.id, {
          status: "running",
          attempt_count: attemptCount,
          started_at: new Date(),
          error: null,
        });

        const stepStart = Date.now();
        try {
          const result = await handler.execute(step, ctx);

          if (result.pause) {
            await updateStepRun(null, stepRun.id, {
              status: "paused",
              output: result.output,
            });
            await updateWorkflowRunStatus(null, workflowRunId, "paused");
            logger.info("Workflow paused at approval gate", {
              organizationId,
              workflowId: workflow.id,
              workflowRunId,
              stepRunId: stepRun.id,
              action: "execute_step",
              durationMs: Date.now() - stepStart,
              success: true,
            });
            return "paused";
          }

          if (result.skipUntilPosition !== undefined && result.skipUntilPosition !== null) {
            ctx.skipUntilPosition = result.skipUntilPosition;
          }

          ctx.stepOutputs.set(step.position, result.output);

          await updateStepRun(null, stepRun.id, {
            status: "completed",
            output: result.output,
            completed_at: new Date(),
          });
        } catch (error) {
          const clientError = toClientError(error);
          await updateStepRun(null, stepRun.id, {
            status: "failed",
            error: clientError.message,
            completed_at: new Date(),
          });
          await updateWorkflowRunStatus(null, workflowRunId, "failed", {
            error: clientError.message,
            completed_at: new Date(),
          });
          logger.error("Step execution failed", {
            organizationId,
            workflowId: workflow.id,
            workflowRunId,
            stepRunId: stepRun.id,
            action: "execute_step",
            durationMs: Date.now() - stepStart,
            success: false,
            error: clientError.message,
          });
          return "failed";
        }
      }

      await updateWorkflowRunStatus(null, workflowRunId, "completed", { completed_at: new Date() });
      logger.info("Workflow run completed", {
        organizationId,
        workflowId: workflow.id,
        workflowRunId,
        action: "execute_run",
        durationMs: Date.now() - started,
        success: true,
      });
      return "completed";
    } catch (error) {
      const message = isAppError(error) ? error.message : "Workflow execution failed";
      await updateWorkflowRunStatus(null, workflowRunId, "failed", {
        error: message,
        completed_at: new Date(),
      });
      throw error;
    }
  }
}

export const workflowEngine = new WorkflowEngine();
