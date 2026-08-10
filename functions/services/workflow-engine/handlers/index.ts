import type { StepHandlerResult, WorkflowContext, WorkflowStep } from "../../../types/index.js";
import {
  approvalGateConfigSchema,
  conditionalBranchConfigSchema,
  dbWriteConfigSchema,
  httpRequestConfigSchema,
  llmCallConfigSchema,
  notifyConfigSchema,
} from "../../../types/schemas.js";
import { AppError } from "../../../utils/errors.js";
import { evaluateCondition, resolveBranchAction } from "../../../utils/conditional-evaluator.js";
import { resolveTemplate } from "../../../utils/template.js";
import { executeLlmCall } from "../../llm/index.js";
import { executeHttpRequest } from "../../http/index.js";
import { sendNotification } from "../../notifications/index.js";
import { insertWorkflowArtifact } from "../repository.js";

export interface StepHandler {
  readonly type: WorkflowStep["type"];
  execute(step: WorkflowStep, ctx: WorkflowContext): Promise<StepHandlerResult>;
}

export class LlmCallHandler implements StepHandler {
  readonly type = "llm_call" as const;

  async execute(step: WorkflowStep, ctx: WorkflowContext): Promise<StepHandlerResult> {
    const config = llmCallConfigSchema.parse(step.config);
    const userPrompt = resolveTemplate(config.userPrompt, {
      triggerPayload: ctx.triggerPayload,
      stepOutputs: ctx.stepOutputs,
      workflowName: ctx.workflowName,
    });
    const systemPrompt = config.systemPrompt
      ? resolveTemplate(config.systemPrompt, {
          triggerPayload: ctx.triggerPayload,
          stepOutputs: ctx.stepOutputs,
          workflowName: ctx.workflowName,
        })
      : undefined;

    const result = await executeLlmCall({ ...config, userPrompt, systemPrompt });
    return { output: { text: result.text, model: result.model, provider: result.provider, usage: result.usage } };
  }
}

export class HttpRequestHandler implements StepHandler {
  readonly type = "http_request" as const;

  async execute(step: WorkflowStep, ctx: WorkflowContext): Promise<StepHandlerResult> {
    const config = httpRequestConfigSchema.parse(step.config);
    const url = resolveTemplate(config.url, {
      triggerPayload: ctx.triggerPayload,
      stepOutputs: ctx.stepOutputs,
      workflowName: ctx.workflowName,
    });
    const result = await executeHttpRequest({ ...config, url });
    return { output: { status: result.status, body: result.body, url: result.url } };
  }
}

export class ConditionalBranchHandler implements StepHandler {
  readonly type = "conditional_branch" as const;

  async execute(step: WorkflowStep, ctx: WorkflowContext): Promise<StepHandlerResult> {
    const config = conditionalBranchConfigSchema.parse(step.config);
    const sourceOutput = ctx.stepOutputs.get(config.sourceStepPosition) ?? {};
    const matched = evaluateCondition({
      source: sourceOutput,
      path: config.path,
      operator: config.operator,
      expectedValue: config.expectedValue,
    });

    const branch = matched ? config.trueBranch : config.falseBranch;
    const resolved = resolveBranchAction(branch, step.position);

    if (resolved.failMessage) {
      throw new AppError("STEP_FAILED", resolved.failMessage, 400);
    }

    return {
      output: { matched, branch: branch.action, skipUntilPosition: resolved.skipUntilPosition },
      skipUntilPosition: resolved.skipUntilPosition,
    };
  }
}

export class ApprovalGateHandler implements StepHandler {
  readonly type = "approval_gate" as const;

  async execute(step: WorkflowStep, _ctx: WorkflowContext): Promise<StepHandlerResult> {
    const config = approvalGateConfigSchema.parse(step.config);
    return {
      output: { message: config.message, awaitingApproval: true },
      pause: true,
    };
  }
}

export class NotifyHandler implements StepHandler {
  readonly type = "notify" as const;

  async execute(step: WorkflowStep, ctx: WorkflowContext): Promise<StepHandlerResult> {
    const config = notifyConfigSchema.parse(step.config);
    const previousPosition = step.position - 1;
    const previousOutput = ctx.stepOutputs.get(previousPosition) ?? {};
    const message = resolveTemplate(config.messageTemplate, {
      triggerPayload: ctx.triggerPayload,
      stepOutputs: ctx.stepOutputs,
      workflowName: ctx.workflowName,
      previousOutput,
    });
    const result = await sendNotification(message, config);
    return { output: { message, ...result } };
  }
}

export class DbWriteHandler implements StepHandler {
  readonly type = "db_write" as const;

  async execute(step: WorkflowStep, ctx: WorkflowContext): Promise<StepHandlerResult> {
    const config = dbWriteConfigSchema.parse(step.config);
    const contentRaw = resolveTemplate(config.fieldMapping.content, {
      triggerPayload: ctx.triggerPayload,
      stepOutputs: ctx.stepOutputs,
      workflowName: ctx.workflowName,
    });

    let content: Record<string, unknown>;
    try {
      content = JSON.parse(contentRaw) as Record<string, unknown>;
    } catch {
      content = { value: contentRaw };
    }

    const artifactId = await insertWorkflowArtifact({
      organizationId: ctx.organizationId,
      workflowRunId: ctx.workflowRunId,
      content,
    });

    return { output: { artifactId, targetTable: config.targetTable } };
  }
}

export function createStepHandlers(): Map<string, StepHandler> {
  const handlers: StepHandler[] = [
    new LlmCallHandler(),
    new HttpRequestHandler(),
    new ConditionalBranchHandler(),
    new ApprovalGateHandler(),
    new NotifyHandler(),
    new DbWriteHandler(),
  ];
  return new Map(handlers.map((h) => [h.type, h]));
}
