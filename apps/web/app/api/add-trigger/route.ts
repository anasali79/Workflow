import { NextResponse } from "next/server";
import { getHasuraServerConfig } from "@/lib/server-config";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workflow_id, type, config } = body;

    if (!workflow_id || !type) {
      return NextResponse.json(
        { message: "workflow_id and type are required" },
        { status: 400 }
      );
    }

    const validTypes = ["manual", "webhook", "scheduled", "database_event"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { message: `Invalid trigger type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const { hasuraUrl, adminSecret } = getHasuraServerConfig();

    const res = await fetch(hasuraUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": adminSecret,
      },
      body: JSON.stringify({
        query: `
          mutation AddWorkflowTrigger($workflowId: uuid!, $type: String!, $config: jsonb!) {
            insert_workflow_triggers_one(
              object: { workflow_id: $workflowId, type: $type, config: $config, enabled: true }
            ) {
              id type config enabled
            }
          }
        `,
        variables: {
          workflowId: workflow_id,
          type,
          config: config ?? {},
        },
      }),
    });

    const data = await res.json();
    if (data.errors && data.errors.length > 0) {
      return NextResponse.json({ message: data.errors[0].message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      trigger: data.data?.insert_workflow_triggers_one,
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to add trigger" },
      { status: 500 }
    );
  }
}
