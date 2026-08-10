import { z } from "zod";

export const llmCallConfigSchema = z.object({
  model: z.string().min(1).optional(),
  systemPrompt: z.string().optional(),
  userPrompt: z.string().min(1),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  maxTokens: z.number().int().positive().optional().default(1024),
});

export const httpRequestConfigSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  url: z.string().url(),
  headers: z.record(z.string()).optional().default({}),
  queryParams: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
  body: z.unknown().optional().nullable(),
  timeoutMs: z.number().int().positive().optional().default(10000),
  expectedStatus: z.array(z.number().int()).optional().default([200]),
});

export const branchActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("continue") }),
  z.object({ action: z.literal("skip_next_n"), count: z.number().int().nonnegative() }),
  z.object({ action: z.literal("skip_to_position"), position: z.number().int().nonnegative() }),
  z.object({ action: z.literal("fail"), message: z.string().optional() }),
]);

export const conditionalBranchConfigSchema = z.object({
  sourceStepPosition: z.number().int().nonnegative(),
  path: z.string().min(1),
  operator: z.enum(["equals", "not_equals", "contains", "not_contains", "gt", "lt", "exists"]),
  expectedValue: z.unknown().optional(),
  trueBranch: branchActionSchema,
  falseBranch: branchActionSchema,
});

export const approvalGateConfigSchema = z.object({
  message: z.string().optional().default("Approval required"),
});

export const notifyConfigSchema = z.object({
  provider: z.enum(["slack", "email"]).default("slack"),
  messageTemplate: z.string().min(1),
  webhookUrl: z.string().optional(),
});

export const dbWriteConfigSchema = z.object({
  targetTable: z.literal("workflow_artifacts"),
  fieldMapping: z.object({
    content: z.string().min(1),
  }),
});

export type LlmCallConfig = z.infer<typeof llmCallConfigSchema>;
export type HttpRequestConfig = z.infer<typeof httpRequestConfigSchema>;
export type ConditionalBranchConfig = z.infer<typeof conditionalBranchConfigSchema>;
export type ApprovalGateConfig = z.infer<typeof approvalGateConfigSchema>;
export type NotifyConfig = z.infer<typeof notifyConfigSchema>;
export type DbWriteConfig = z.infer<typeof dbWriteConfigSchema>;
export type BranchAction = z.infer<typeof branchActionSchema>;
