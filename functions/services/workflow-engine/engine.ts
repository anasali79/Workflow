
import type {
  TriggerRunOptions,
  TriggerRunResult,
  WorkflowContext,
  WorkflowRunStatus,
} from "../../types/index.js";

import {
  AppError,
  isAppError,
  toClientError,
} from "../../utils/errors.js";

import { logger } from "../../utils/logger.js";

import {
  assertCanTriggerWorkflow,
  loadWorkflowRun,
  loadWorkflowSteps,
  resolveWorkflow,
} from "../authorization/index.js";

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


  /**
   * Shared entry point for:
   *
   * - manual
   * - webhook
   * - scheduled
   * - database_event
   *
   * IMPORTANT:
   * This method NEVER waits for human approval.
   * Approval gates return "paused".
   */
  async triggerRun(
    options: TriggerRunOptions,
  ): Promise<TriggerRunResult> {
    const start = Date.now();

    const {
      workflowId,
      triggerType,
      triggeredBy,
      idempotencyKey,
      triggerPayload = {},
    } = options;


    // ---------------------------------------------------------
    // 1. Idempotency check
    // ---------------------------------------------------------

    if (idempotencyKey) {
      const existing = await findExistingRunByIdempotency(
        workflowId,
        idempotencyKey,
      );

      if (existing) {
        logger.info(
          "Idempotent workflow run returned existing",
          {
            workflowId,
            workflowRunId: existing.id,
            status: existing.status,
            action: "trigger_run",
            success: true,
          },
        );

        /**
         * IMPORTANT:
         *
         * Do NOT execute the workflow again.
         *
         * If the existing run is paused because of an approval
         * gate, simply return "paused".
         */
        return {
          workflowRunId: existing.id,
          status: existing.status as WorkflowRunStatus,
          resumed: false,
        };
      }
    }


    // ---------------------------------------------------------
    // 2. Resolve workflow / authorization
    // ---------------------------------------------------------

    const resolved = triggeredBy
      ? await assertCanTriggerWorkflow(
          triggeredBy,
          workflowId,
        )
      : await resolveWorkflow(workflowId);


    if (resolved.workflow.status !== "active") {
      throw new AppError(
        "VALIDATION_ERROR",
        "Workflow is not active",
        400,
      );
    }


    // ---------------------------------------------------------
    // 3. Load workflow steps
    // ---------------------------------------------------------

    const steps = await loadWorkflowSteps(workflowId);

    if (steps.length === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Workflow has no steps",
        400,
      );
    }


    // ---------------------------------------------------------
    // 4. Create workflow run
    // ---------------------------------------------------------

    const workflowRunId = await withTransaction(
      async (client) => {
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
      },
    );


    logger.info(
      "Workflow run created",
      {
        organizationId: resolved.organizationId,
        workflowId,
        workflowRunId,
        triggerType,
        action: "trigger_run",
        durationMs: Date.now() - start,
        success: true,
      },
    );


    // ---------------------------------------------------------
    // 5. Execute workflow
    //
    // Approval gate MUST return "paused".
    // It must NOT wait for the human.
    // ---------------------------------------------------------

    const status = await this.executeRun(
      workflowRunId,
      triggerPayload,
    );


    return {
      workflowRunId,
      status: status as WorkflowRunStatus,
      resumed: false,
    };
  }


  /**
   * Resume a workflow after a human approves an approval gate.
   *
   * This is called by the approval endpoint, NOT by the webhook.
   */
  async resumeAfterApproval(
    stepRunId: string,
    approvedBy: string,
  ): Promise<TriggerRunResult> {
    const {
      assertCanApproveStep,
    } = await import("../authorization/index.js");


    // ---------------------------------------------------------
    // 1. Verify approver permission
    // ---------------------------------------------------------

    const resolved = await assertCanApproveStep(
      approvedBy,
      stepRunId,
    );


    // ---------------------------------------------------------
    // 2. Atomically approve paused step
    // ---------------------------------------------------------

    await withTransaction(async (client) => {
      const locked = await lockPausedStepRun(
        client,
        stepRunId,
      );

      if (!locked) {
        throw new AppError(
          "CONFLICT",
          "Step is not awaiting approval or was already approved",
          409,
        );
      }


      await updateStepRun(
        client,
        stepRunId,
        {
          status: "completed",
          approved_by: approvedBy,
          approved_at: new Date(),
          output: {
            approved: true,
            approvedBy,
          },
          completed_at: new Date(),
        },
      );


      await updateWorkflowRunStatus(
        client,
        resolved.workflowRunId,
        "running",
      );
    });


    logger.info(
      "Approval granted, resuming workflow",
      {
        workflowRunId: resolved.workflowRunId,
        stepRunId,
        approvedBy,
        action: "resume_after_approval",
        success: true,
      },
    );


    // ---------------------------------------------------------
    // 3. Continue workflow
    // ---------------------------------------------------------

    const status = await this.executeRun(
      resolved.workflowRunId,
    );


    return {
      workflowRunId: resolved.workflowRunId,
      status: status as WorkflowRunStatus,
      resumed: true,
    };
  }


  /**
   * Execute / resume a workflow.
   *
   * Approval gates pause execution and return immediately.
   */
  async executeRun(
    workflowRunId: string,
    triggerPayload: Record<string, unknown> = {},
  ): Promise<string> {
    const started = Date.now();


    // ---------------------------------------------------------
    // 1. Load run + steps
    // ---------------------------------------------------------

    const stepRuns = await loadStepRunsForRun(
      workflowRunId,
    );

    if (stepRuns.length === 0) {
      throw new AppError(
        "NOT_FOUND",
        "No step runs found for workflow run",
        404,
      );
    }


    const run = await loadWorkflowRun(
      workflowRunId,
    );


    const {
      workflow,
      organizationId,
    } = await resolveWorkflow(
      run.workflow_id,
    );


    const steps = await loadWorkflowSteps(
      run.workflow_id,
    );


    // ---------------------------------------------------------
    // 2. Build workflow context
    // ---------------------------------------------------------

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


    // ---------------------------------------------------------
    // 3. Restore completed/skipped outputs
    // ---------------------------------------------------------

    for (const sr of stepRuns) {
      if (
        sr.output &&
        (
          sr.status === "completed" ||
          sr.status === "skipped"
        )
      ) {
        ctx.stepOutputs.set(
          sr.step_position,
          sr.output as Record<string, unknown>,
        );
      }
    }


    await updateWorkflowRunStatus(
      null,
      workflowRunId,
      "running",
      {
        started_at: new Date(),
      },
    );


    try {
      // -------------------------------------------------------
      // 4. Execute steps sequentially
      // -------------------------------------------------------

      for (const stepRun of stepRuns) {
        const step = steps.find(
          (s) => s.id === stepRun.workflow_step_id,
        );


        if (!step) {
          logger.warn(
            "Workflow step definition not found",
            {
              workflowRunId,
              stepRunId: stepRun.id,
              action: "execute_step",
            },
          );

          continue;
        }


        // Already completed/skipped.
        if (
          stepRun.status === "completed" ||
          stepRun.status === "skipped"
        ) {
          continue;
        }


        // -----------------------------------------------------
        // Conditional branch
        // -----------------------------------------------------

        if (
          ctx.skipUntilPosition !== null &&
          step.position >= ctx.skipUntilPosition
        ) {
          await updateStepRun(
            null,
            stepRun.id,
            {
              status: "skipped",
              completed_at: new Date(),
              output: {
                skipped: true,
                reason: "conditional_branch",
              },
            },
          );


          ctx.stepOutputs.set(
            step.position,
            {
              skipped: true,
            },
          );


          continue;
        }


        // -----------------------------------------------------
        // Find handler
        // -----------------------------------------------------

        const handler = this.handlers.get(
          step.type,
        );


        if (!handler) {
          throw new AppError(
            "INTERNAL_ERROR",
            `No handler for step type ${step.type}`,
            500,
          );
        }


        // -----------------------------------------------------
        // Mark step running
        // -----------------------------------------------------

        const attemptCount =
          (stepRun.attempt_count ?? 0) + 1;


        await updateStepRun(
          null,
          stepRun.id,
          {
            status: "running",
            attempt_count: attemptCount,
            started_at: new Date(),
            error: null,
          },
        );


        const stepStart = Date.now();


        try {
          // ---------------------------------------------------
          // Execute handler.
          //
          // Approval handler MUST resolve with:
          //
          // {
          //   pause: true,
          //   output: {...}
          // }
          //
          // It must NOT wait for human approval.
          // ---------------------------------------------------

          const result = await handler.execute(
            step,
            ctx,
          );


          // ---------------------------------------------------
          // APPROVAL GATE
          // ---------------------------------------------------

          if (result.pause) {
            await updateStepRun(
              null,
              stepRun.id,
              {
                status: "paused",
                output: result.output,
              },
            );


            await updateWorkflowRunStatus(
              null,
              workflowRunId,
              "paused",
            );


            logger.info(
              "Workflow paused at approval gate",
              {
                organizationId,
                workflowId: workflow.id,
                workflowRunId,
                stepRunId: stepRun.id,
                action: "execute_step",
                durationMs:
                  Date.now() - stepStart,
                success: true,
              },
            );


            /**
             * CRITICAL:
             *
             * Return immediately.
             *
             * Do NOT wait for human approval here.
             */
            return "paused";
          }


          // ---------------------------------------------------
          // Conditional skip
          // ---------------------------------------------------

          if (
            result.skipUntilPosition !== undefined &&
            result.skipUntilPosition !== null
          ) {
            ctx.skipUntilPosition =
              result.skipUntilPosition;
          }


          // ---------------------------------------------------
          // Save output
          // ---------------------------------------------------

          ctx.stepOutputs.set(
            step.position,
            result.output,
          );


          await updateStepRun(
            null,
            stepRun.id,
            {
              status: "completed",
              output: result.output,
              completed_at: new Date(),
            },
          );


        } catch (error) {
          // ---------------------------------------------------
          // Step failed
          // ---------------------------------------------------

          const clientError =
            toClientError(error);


          await updateStepRun(
            null,
            stepRun.id,
            {
              status: "failed",
              error: clientError.message,
              completed_at: new Date(),
            },
          );


          await updateWorkflowRunStatus(
            null,
            workflowRunId,
            "failed",
            {
              error: clientError.message,
              completed_at: new Date(),
            },
          );


          logger.error(
            "Step execution failed",
            {
              organizationId,
              workflowId: workflow.id,
              workflowRunId,
              stepRunId: stepRun.id,
              action: "execute_step",
              durationMs:
                Date.now() - stepStart,
              success: false,
              error: clientError.message,
            },
          );


          return "failed";
        }
      }


      // -------------------------------------------------------
      // Workflow completed
      // -------------------------------------------------------

      await updateWorkflowRunStatus(
        null,
        workflowRunId,
        "completed",
        {
          completed_at: new Date(),
        },
      );


      logger.info(
        "Workflow run completed",
        {
          organizationId,
          workflowId: workflow.id,
          workflowRunId,
          action: "execute_run",
          durationMs: Date.now() - started,
          success: true,
        },
      );


      return "completed";


    } catch (error) {
      // -------------------------------------------------------
      // Unexpected workflow error
      // -------------------------------------------------------

      const message = isAppError(error)
        ? error.message
        : "Workflow execution failed";


      await updateWorkflowRunStatus(
        null,
        workflowRunId,
        "failed",
        {
          error: message,
          completed_at: new Date(),
        },
      );


      logger.error(
        "Workflow execution failed",
        {
          organizationId,
          workflowId: workflow.id,
          workflowRunId,
          action: "execute_run",
          success: false,
          error: message,
        },
      );


      throw error;
    }
  }
}


export const workflowEngine =
  new WorkflowEngine();
