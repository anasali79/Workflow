type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  organizationId?: string;
  workflowId?: string;
  workflowRunId?: string;
  stepRunId?: string;
  action?: string;
  durationMs?: number;
  success?: boolean;
  error?: string;
  [key: string]: unknown;
}

const SECRET_KEYS = /api[_-]?key|secret|password|token|authorization/i;

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? "[REDACTED]" : sanitize(v);
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const safeContext = context ? (sanitize(context) as Record<string, unknown>) : {};
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...safeContext,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};
