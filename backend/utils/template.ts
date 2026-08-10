/** Resolve {{trigger.payload.x}} and {{step_N.output.path}} templates without eval. */
export function resolveTemplate(
  template: string,
  ctx: {
    triggerPayload: Record<string, unknown>;
    stepOutputs: Map<number, Record<string, unknown>>;
    workflowName?: string;
    previousOutput?: Record<string, unknown>;
  },
): string {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.trim();

    if (key === "workflowName" && ctx.workflowName) return ctx.workflowName;
    if (key === "previousOutput") return stringify(getNestedValue(ctx.previousOutput ?? {}, ""));

    if (key.startsWith("trigger.")) {
      return stringify(getNestedValue({ trigger: { payload: ctx.triggerPayload } }, key));
    }

    const stepMatch = /^step_(\d+)\.(.+)$/.exec(key);
    if (stepMatch) {
      const position = Number(stepMatch[1]);
      const path = stepMatch[2];
      const output = ctx.stepOutputs.get(position) ?? {};
      return stringify(getNestedValue(output, path));
    }

    return "";
  });
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function objectFromResolvedStrings(
  record: Record<string, string>,
  ctx: Parameters<typeof resolveTemplate>[1],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = resolveTemplate(v, ctx);
  }
  return out;
}
