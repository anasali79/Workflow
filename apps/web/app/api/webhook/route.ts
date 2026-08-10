import { NextRequest, NextResponse } from "next/server";
import { workflowEngine } from "@workflow/backend";
import { getHasuraServerConfig } from "@/lib/server-config";

async function handleWebhook(request: NextRequest) {
  try {
    const headers = Object.fromEntries(request.headers.entries());

    // 1. Secret validation
    const expectedSecret = process.env.WEBHOOK_SECRET || process.env.NEXT_PUBLIC_WEBHOOK_SECRET || "dev_webhook_secret_key_12345";
    const providedSecret =
      headers["x-webhook-secret"] ||
      headers["X-Webhook-Secret"] ||
      request.nextUrl.searchParams.get("secret");

    if (expectedSecret && providedSecret !== expectedSecret) {
      return NextResponse.json(
        { message: "Invalid x-webhook-secret header or secret parameter", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    // 2. Resolve trigger ID (Query -> Body)
    let triggerId = request.nextUrl.searchParams.get("triggerId") || request.nextUrl.searchParams.get("trigger_id");
    
    let triggerPayload: Record<string, unknown> = {};
    try {
      const contentType = headers["content-type"] ?? "";
      if (contentType.includes("application/json")) {
        const body = await request.json();
        if (body && typeof body === "object" && !Array.isArray(body)) {
          triggerPayload = body as Record<string, unknown>;
          if (!triggerId && typeof body.trigger_id === "string") triggerId = body.trigger_id;
          if (!triggerId && typeof body.triggerId === "string") triggerId = body.triggerId;
        }
      }
    } catch {
      // Non-JSON body is acceptable
    }

    if (!triggerId) {
      return NextResponse.json(
        { message: "trigger_id is required in URL path, query params, or JSON body", code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(triggerId)) {
      return NextResponse.json(
        { message: `Invalid trigger_id UUID format: ${triggerId}`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    // 3. Load trigger from Hasura using admin secret
    const { hasuraUrl, adminSecret } = getHasuraServerConfig();
    const fetchRes = await fetch(hasuraUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": adminSecret,
      },
      body: JSON.stringify({
        query: `
          query GetWebhookTrigger($id: uuid!) {
            workflow_triggers_by_pk(id: $id) {
              id
              workflow_id
              type
              enabled
              config
            }
          }
        `,
        variables: { id: triggerId },
      }),
    });

    const graphqlData = await fetchRes.json();
    const trigger = graphqlData.data?.workflow_triggers_by_pk;

    if (!trigger) {
      return NextResponse.json(
        { message: `Webhook trigger with ID '${triggerId}' not found`, code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (trigger.type !== "webhook") {
      return NextResponse.json(
        { message: `Trigger '${triggerId}' is type '${trigger.type}', not 'webhook'`, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (!trigger.enabled) {
      return NextResponse.json(
        { message: `Webhook trigger '${triggerId}' is currently disabled`, code: "DISABLED" },
        { status: 400 }
      );
    }

    // 4. Idempotency key
    const idempotencyKey = headers["x-idempotency-key"] || headers["X-Idempotency-Key"] || null;

    // 5. Trigger workflow execution
    const result = await workflowEngine.triggerRun({
      workflowId: trigger.workflow_id,
      triggerType: "webhook",
      triggeredBy: null,
      idempotencyKey,
      triggerPayload,
    });

    return NextResponse.json({
      success: true,
      workflow_run_id: result.workflowRunId,
      status: result.status,
      message: result.resumed ? "Existing run returned (idempotent)" : `Workflow run ${result.status}`,
    });

  } catch (err) {
    console.error("[/api/webhook]", err);
    return NextResponse.json(
      {
        message: err instanceof Error ? err.message : "Internal server error",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleWebhook(request);
}

export async function GET(request: NextRequest) {
  return handleWebhook(request);
}
