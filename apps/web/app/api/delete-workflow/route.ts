import { NextResponse } from "next/server";
import { getHasuraServerConfig } from "@/lib/server-config";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workflow_id } = body;

    if (!workflow_id) {
      return NextResponse.json({ message: "workflow_id is required" }, { status: 400 });
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
          mutation DeleteWorkflowCascade($workflowId: uuid!) {
            delete_step_runs(where: { workflow_step: { workflow_id: { _eq: $workflowId } } }) {
              affected_rows
            }
            delete_workflow_runs(where: { workflow_id: { _eq: $workflowId } }) {
              affected_rows
            }
            delete_workflow_steps(where: { workflow_id: { _eq: $workflowId } }) {
              affected_rows
            }
            delete_workflow_triggers(where: { workflow_id: { _eq: $workflowId } }) {
              affected_rows
            }
            delete_workflows_by_pk(id: $workflowId) {
              id
            }
          }
        `,
        variables: { workflowId: workflow_id },
      }),
    });

    const data = await res.json();
    if (data.errors && data.errors.length > 0) {
      return NextResponse.json({ message: data.errors[0].message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedWorkflowId: workflow_id });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to delete workflow" },
      { status: 500 }
    );
  }
}
