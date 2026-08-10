import { NextResponse } from "next/server";
import { getHasuraServerConfig } from "@/lib/server-config";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { trigger_id } = body;

    if (!trigger_id) {
      return NextResponse.json(
        { message: "trigger_id is required" },
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
          mutation DeleteWorkflowTrigger($triggerId: uuid!) {
            delete_workflow_triggers_by_pk(id: $triggerId) {
              id
            }
          }
        `,
        variables: { triggerId: trigger_id },
      }),
    });

    const data = await res.json();
    if (data.errors && data.errors.length > 0) {
      return NextResponse.json({ message: data.errors[0].message }, { status: 500 });
    }

    if (!data.data?.delete_workflow_triggers_by_pk) {
      return NextResponse.json({ message: "Trigger not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to delete trigger" },
      { status: 500 }
    );
  }
}
