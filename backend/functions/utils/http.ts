/**
 * Shared HTTP utility helpers for all Nhost Function handlers.
 *
 * Keeps handler files lean — they only contain business logic.
 * Ensures consistent error serialization, secret validation, and
 * Hasura session-variable extraction across all functions.
 */

import { AppError, isAppError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HasuraActionPayload<TInput = Record<string, unknown>> {
  action: { name: string };
  input: TInput;
  session_variables: Record<string, string>;
  request_query?: string;
}

export interface HasuraEventPayload {
  id: string;
  created_at: string;
  trigger: { name: string };
  table: { schema: string; name: string };
  event: {
    op: "INSERT" | "UPDATE" | "DELETE" | "MANUAL";
    data: {
      old: Record<string, unknown> | null;
      new: Record<string, unknown> | null;
    };
    session_variables?: Record<string, string>;
    trace_context?: Record<string, unknown>;
  };
  delivery_info: { max_retries: number; current_retry: number };
}

export interface JsonResponse {
  status: number;
  body: unknown;
}

// ─── Session helpers ──────────────────────────────────────────────────────────

/**
 * Extract the authenticated Nhost user ID from Hasura session variables.
 * Throws FORBIDDEN (401) when the session is absent (unauthenticated call).
 */
export function extractUserId(sessionVariables: Record<string, string>): string {
  const userId =
    sessionVariables["x-hasura-user-id"] || sessionVariables["X-Hasura-User-Id"];
  if (!userId) {
    throw new AppError("FORBIDDEN", "Authentication required", 401);
  }
  return userId;
}

// ─── Secret validation ────────────────────────────────────────────────────────

/**
 * Validates the x-internal-secret header sent by Hasura to function handlers.
 * Prevents direct invocation of function endpoints without going through Hasura.
 */
export function validateInternalSecret(headers: Record<string, string | string[] | undefined>): void {
  const secret = process.env.INTERNAL_FUNCTION_SECRET;
  if (!secret) return; // Skip check in development when secret is not configured

  const provided =
    (headers["x-internal-secret"] as string | undefined) ||
    (headers["X-Internal-Secret"] as string | undefined);

  if (provided !== secret) {
    throw new AppError("FORBIDDEN", "Invalid internal secret", 403);
  }
}

/**
 * Validates the webhook secret header for public-facing webhook endpoints.
 */
export function validateWebhookSecret(headers: Record<string, string | string[] | undefined>): void {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return; // Optional in dev

  const provided =
    (headers["x-webhook-secret"] as string | undefined) ||
    (headers["X-Webhook-Secret"] as string | undefined);

  if (provided !== secret) {
    throw new AppError("FORBIDDEN", "Invalid webhook secret", 403);
  }
}

/**
 * Validates the scheduled trigger secret.
 */
export function validateScheduledSecret(headers: Record<string, string | string[] | undefined>): void {
  const secret = process.env.SCHEDULED_TRIGGER_SECRET;
  if (!secret) return; // Optional in dev

  const provided =
    (headers["x-scheduled-secret"] as string | undefined) ||
    (headers["X-Scheduled-Secret"] as string | undefined);

  if (provided !== secret) {
    throw new AppError("FORBIDDEN", "Invalid scheduled trigger secret", 403);
  }
}

// ─── UUID validation ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertValidUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new AppError("VALIDATION_ERROR", `Invalid UUID for field: ${field}`, 400);
  }
  return value;
}

// ─── Response helpers ─────────────────────────────────────────────────────────

export function errorResponse(error: unknown): JsonResponse {
  if (isAppError(error)) {
    logger.error("Function error", {
      action: "function_error",
      success: false,
      error: error.message,
      code: error.code,
    });
    return {
      status: error.httpStatus,
      body: { message: error.message, code: error.code },
    };
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  logger.error("Unexpected function error", {
    action: "function_error",
    success: false,
    error: message,
  });
  return {
    status: 500,
    body: { message: "Internal server error", code: "INTERNAL_ERROR" },
  };
}

export function successResponse(body: unknown, status = 200): JsonResponse {
  return { status, body };
}
