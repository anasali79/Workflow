// Nhost Function: scheduled-trigger
// Called on a recurring schedule (configured in hasura/metadata/cron_triggers.yaml).
// Default schedule: every 15 minutes ("*/15 * * * *")
//
// Logic:
//   1. Validates X-Scheduled-Secret header
//   2. Finds all ENABLED scheduled triggers in workflow_triggers table
//   3. For each trigger: checks whether it is "due" based on its cron expression
//      and the last time it fired (stored in config.lastFiredAt)
//   4. Fires due triggers through the shared WorkflowEngine
//   5. Updates config.lastFiredAt in the database after each fire
//
// Cron evaluation:
//   We use a minimal cron evaluator to determine if the trigger is due.
//   A trigger is considered "due" when now() is within the current cron window
//   AND it has not already fired in this window (same UTC minute).
//   This is deliberately simple and suitable for the >=1-minute granularity
//   that Nhost scheduled functions support.
//
// Race conditions:
//   Uses SELECT ... FOR UPDATE SKIP LOCKED to prevent multiple instances
//   from firing the same trigger simultaneously.
//
// Testing locally (PowerShell):
//   Invoke-WebRequest -Method POST http://localhost:1337/v1/functions/scheduled-trigger `
//     -Headers @{"X-Scheduled-Secret"="<SCHEDULED_TRIGGER_SECRET>"}

import { query, withTransaction } from "../services/database/client.js";
import { workflowEngine } from "../services/workflow-engine/engine.js";
import { logger } from "../utils/logger.js";
import {
  errorResponse,
  successResponse,
  validateScheduledSecret,
} from "../utils/http.js";

interface ScheduledTriggerRow {
  id: string;
  workflow_id: string;
  type: string;
  enabled: boolean;
  config: {
    cron?: string;
    lastFiredAt?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Cron evaluation helpers
// ---------------------------------------------------------------------------

function matchesCronField(expr: string, value: number): boolean {
  if (expr === "*") return true;
  if (expr.startsWith("*/")) {
    const step = parseInt(expr.slice(2), 10);
    return !isNaN(step) && value % step === 0;
  }
  const parts = expr.split(",");
  return parts.some((part) => {
    if (part.includes("-")) {
      const [a, b] = part.split("-").map(Number);
      return value >= (a ?? 0) && value <= (b ?? 59);
    }
    return parseInt(part, 10) === value;
  });
}

/**
 * Returns true if the cron expression matches the current UTC minute
 * AND the trigger has not already fired in this same minute.
 */
function isCronDue(cron: string, lastFiredAt: Date | null, now: Date): boolean {
  if (!cron) return false;

  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const [minuteExpr, hourExpr, domExpr, monthExpr, dowExpr] = fields;
  if (!minuteExpr || !hourExpr || !domExpr || !monthExpr || !dowExpr) return false;

  const matches =
    matchesCronField(minuteExpr, now.getUTCMinutes()) &&
    matchesCronField(hourExpr, now.getUTCHours()) &&
    matchesCronField(domExpr, now.getUTCDate()) &&
    matchesCronField(monthExpr, now.getUTCMonth() + 1) &&
    matchesCronField(dowExpr, now.getUTCDay());

  if (!matches) return false;

  // Skip if already fired in this UTC minute
  if (lastFiredAt) {
    const last = new Date(lastFiredAt);
    const sameMinute =
      last.getUTCFullYear() === now.getUTCFullYear() &&
      last.getUTCMonth() === now.getUTCMonth() &&
      last.getUTCDate() === now.getUTCDate() &&
      last.getUTCHours() === now.getUTCHours() &&
      last.getUTCMinutes() === now.getUTCMinutes();
    if (sameMinute) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/**
 * Load all enabled scheduled triggers with a FOR UPDATE SKIP LOCKED.
 * Rows already locked by another instance are skipped, preventing duplicate fires.
 */
async function loadDueScheduledTriggers(now: Date): Promise<ScheduledTriggerRow[]> {
  const result = await query<ScheduledTriggerRow>(
    `SELECT id, workflow_id, type, enabled, config
     FROM workflow_triggers
     WHERE type = 'scheduled' AND enabled = true
     FOR UPDATE SKIP LOCKED`,
  );
  return result.rows.filter((row) => {
    const cron = row.config?.cron ?? "";
    const lastFiredAt = row.config?.lastFiredAt ? new Date(row.config.lastFiredAt) : null;
    return isCronDue(cron, lastFiredAt, now);
  });
}

/**
 * Persist the lastFiredAt timestamp in the trigger's config JSONB.
 * This prevents re-firing in the same UTC minute.
 */
async function markTriggerFired(triggerId: string, firedAt: Date): Promise<void> {
  await query(
    `UPDATE workflow_triggers
     SET config = jsonb_set(
       config,
       '{lastFiredAt}',
       to_jsonb($2::text)
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [triggerId, firedAt.toISOString()],
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers = Object.fromEntries(req.headers.entries());

  try {
    validateScheduledSecret(headers);

    const now = new Date();
    const results: Array<{
      triggerId: string;
      workflowId: string;
      runId: string;
      status: string;
    }> = [];

    // Wrap scan + fire in one transaction so the SKIP LOCKED holds
    await withTransaction(async () => {
      const dueTriggers = await loadDueScheduledTriggers(now);

      logger.info("Scheduled trigger scan", {
        action: "scheduled_trigger_scan",
        dueCount: dueTriggers.length,
        checkedAt: now.toISOString(),
        success: true,
      });

      for (const trigger of dueTriggers) {
        try {
          // Mark fired first (inside txn) so concurrent workers skip it
          await markTriggerFired(trigger.id, now);

          logger.info("Scheduled trigger firing", {
            action: "scheduled_trigger_fire",
            triggerId: trigger.id,
            workflowId: trigger.workflow_id,
            success: true,
          });

          const result = await workflowEngine.triggerRun({
            workflowId: trigger.workflow_id,
            triggerType: "scheduled",
            triggeredBy: null,
            triggerPayload: {
              scheduledAt: now.toISOString(),
              triggerId: trigger.id,
            },
          });

          results.push({
            triggerId: trigger.id,
            workflowId: trigger.workflow_id,
            runId: result.workflowRunId,
            status: result.status,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          logger.error("Scheduled trigger fire failed", {
            action: "scheduled_trigger_fire",
            triggerId: trigger.id,
            workflowId: trigger.workflow_id,
            success: false,
            error: message,
          });
          results.push({
            triggerId: trigger.id,
            workflowId: trigger.workflow_id,
            runId: "",
            status: `error: ${message}`,
          });
        }
      }
    });

    const { body, status } = successResponse({
      fired: results.length,
      results,
      checkedAt: now.toISOString(),
    });

    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const { body, status } = errorResponse(error);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
