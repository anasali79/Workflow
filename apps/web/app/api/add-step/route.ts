import { NextResponse } from "next/server";
import { getHasuraServerConfig } from "@/lib/server-config";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workflow_id, name, type, config } = body;

    if (!workflow_id || !name || !type) {
      return NextResponse.json({ message: "workflow_id, name and type are required" }, { status: 400 });
    }

    const { hasuraUrl, adminSecret } = getHasuraServerConfig();

    // 1. Fetch current max position for this workflow to avoid unique constraint violations
    const posRes = await fetch(hasuraUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": adminSecret,
      },
      body: JSON.stringify({
        query: `
          query GetMaxPosition($workflowId: uuid!) {
            workflow_steps(where: { workflow_id: { _eq: $workflowId } }, order_by: { position: desc }, limit: 1) {
              position
            }
          }
        `,
        variables: { workflowId: workflow_id },
      }),
    });

    const posData = await posRes.json();
    const existingSteps = posData.data?.workflow_steps ?? [];
    const newPosition = existingSteps.length > 0 ? (existingSteps[0].position ?? 0) + 1 : 0;

    // 2. Insert new step with guaranteed unique position
    const res = await fetch(hasuraUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": adminSecret,
      },
      body: JSON.stringify({
        query: `
          mutation AddWorkflowStep($workflowId: uuid!, $position: Int!, $name: String!, $type: String!, $config: jsonb!) {
            insert_workflow_steps_one(
              object: { workflow_id: $workflowId, position: $position, name: $name, type: $type, config: $config }
            ) {
              id name position type config
            }
          }
        `,
        variables: {
          workflowId: workflow_id,
          position: newPosition,
          name,
          type,
          config: config ?? {},
        },
      }),
    });

    const data = await res.json();
    if (data.errors && data.errors.length > 0) {
      return NextResponse.json({ message: data.errors[0].message }, { status: 500 });
    }

    return NextResponse.json({ success: true, step: data.data?.insert_workflow_steps_one });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to add step" },
      { status: 500 }
    );
  }
}
