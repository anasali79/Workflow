/**
 * Nhost Function: db-event-trigger
 *
 * Hasura Event Trigger webhook handler.
 *
 * Fired by Hasura when a row is INSERT-ed into the `inbox_events` table
 * (the "watched table" for database_event triggers).
 *
 * The Event Trigger is defined in:
 *   hasura/metadata/databases/default/tables/public_inbox_events.yaml
 *
 * Flow:
 *   1. Hasura sends POST with HasuraEventPayload
 *   2. Handler validates x-internal-secret (Hasura is configured to send it)
 *   3. Extracts the new row data from event.data.new
 *   4. Finds which workflow_trigger (type=database_event) is configured
 *      to watch the inbox_events table for this event
 *   5. Resolves the linked workflow
 *   6. Fires it through the shared WorkflowEngine
 *
 * Config matching:
 *   workflow_triggers rows of type 'database_event' store:
 *     config.watchedTable   = "inbox_events"
 *     config.watchedColumn  = "event_type"  (optional filter)
 *     config.watchedValue   = "some_value"  (optional filter)
 *
 * This lets users configure multiple database_event triggers on
 * different event types from the same inbox table.
 *
 * Hasura Event Trigger guarantees at-least-once delivery with retries.
 * We use idempotency_key = "<event_id>" to prevent double execution.
 */

import { query } from "../../services/database/client.js";
import { workflowEngine } from "../../services/workflow-engine/engine.js";
import { logger } from "../../utils/logger.js";
import {
  errorResponse,
  successResponse,
  validateInternalSecret,
  type HasuraEventPayload,
} from "../utils/http.js";

interface DatabaseEventTriggerConfig {
  watchedTable?: string;
  watchedColumn?: string | null;
  watchedValue?: unknown;
}

interface DbEventTriggerRow {
  id: string;
  workflow_id: string;
  type: string;
  enabled: boolean;
  config: DatabaseEventTriggerConfig;
}

/**
 * Find all enabled database_event triggers that match the incoming event.
 *
 * A trigger matches when:
 *   - config.watchedTable === event table name (e.g. "inbox_events")
 *   - config.watchedColumn is absent OR the new row's column matches config.watchedValue
 */
async function findMatchingDatabaseEventTriggers(
  tableName: string,
  newRow: Record<string, unknown>,
): Promise<DbEventTriggerRow[]> {
  const result = await query<DbEventTriggerRow>(
    `SELECT id, workflow_id, type, enabled, config
     FROM workflow_triggers
     WHERE type = 'database_event' AND enabled = true`,
  );

  return result.rows.filter((trigger) => {
    const cfg = trigger.config;
    if (cfg.watchedTable && cfg.watchedTable !== tableName) return false;
    if (cfg.watchedColumn) {
      const actualValue = newRow[cfg.watchedColumn];
      if (cfg.watchedValue !== undefined && actualValue !== cfg.watchedValue) {
        return false;
      }
    }
    return true;
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers = Object.fromEntries(req.headers.entries());

  try {
    // Hasura sends the internal secret in the header configured in Event Trigger definition
    validateInternalSecret(headers);

    const payload = (await req.json()) as HasuraEventPayload;

    const eventId = payload.id;
    const tableName = payload.table?.name ?? "unknown";
    const op = payload.event?.op;
    const newRow = (payload.event?.data?.new ?? {}) as Record<string, unknown>;

    logger.info("Database event trigger received", {
      action: "db_event_trigger",
      eventId,
      tableName,
      op,
      success: true,
    });

    // Only handle INSERT (and MANUAL for testing)
    if (op !== "INSERT" && op !== "MANUAL") {
      return new Response(
        JSON.stringify({ message: `Ignoring event op: ${op}` }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Find matching workflow triggers
    const matchingTriggers = await findMatchingDatabaseEventTriggers(tableName, newRow);

    if (matchingTriggers.length === 0) {
      logger.info("No matching database_event triggers found", {
        action: "db_event_trigger",
        eventId,
        tableName,
        success: true,
      });
      return new Response(
        JSON.stringify({ message: "No matching triggers configured", fired: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const results: Array<{ triggerId: string; workflowId: string; runId: string; status: string }> = [];

    for (const trigger of matchingTriggers) {
      try {
        // Use Hasura event ID + trigger ID as idempotency key
        // Hasura may retry delivery; this prevents duplicate runs
        const idempotencyKey = `db_event:${eventId}:${trigger.id}`;

        const result = await workflowEngine.triggerRun({
          workflowId: trigger.workflow_id,
          triggerType: "database_event",
          triggeredBy: null,
          idempotencyKey,
          triggerPayload: {
            eventId,
            tableName,
            op,
            row: newRow,
            triggerId: trigger.id,
          },
        });

        logger.info("Database event workflow fired", {
          action: "db_event_trigger_fire",
          eventId,
          triggerId: trigger.id,
          workflowId: trigger.workflow_id,
          workflowRunId: result.workflowRunId,
          status: result.status,
          resumed: result.resumed,
          success: true,
        });

        results.push({
          triggerId: trigger.id,
          workflowId: trigger.workflow_id,
          runId: result.workflowRunId,
          status: result.status,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        logger.error("Database event trigger fire failed", {
          action: "db_event_trigger_fire",
          eventId,
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

    const { body, status } = successResponse({
      fired: results.length,
      results,
      eventId,
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
