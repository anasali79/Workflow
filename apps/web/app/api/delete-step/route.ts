import { NextResponse } from "next/server";
import { getHasuraServerConfig } from "@/lib/server-config";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { step_id } = body;

    if (!step_id) {
      return NextResponse.json({ message: "step_id is required" }, { status: 400 });
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
          mutation DeleteStepCascade($stepId: uuid!) {
            delete_step_runs(where: { workflow_step_id: { _eq: $stepId } }) {
              affected_rows
            }
            delete_workflow_steps_by_pk(id: $stepId) {
              id
            }
          }
        `,
        variables: { stepId: step_id },
      }),
    });

    const data = await res.json();
    if (data.errors && data.errors.length > 0) {
      return NextResponse.json({ message: data.errors[0].message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedStepId: step_id });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to delete step" },
      { status: 500 }
    );
  }
}
