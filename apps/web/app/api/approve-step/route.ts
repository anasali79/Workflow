/**
 * Next.js API Route: /api/approve-step
 *
 * Directly approves a paused approval_gate step using backend workflowEngine.
 * Validates the user's JWT via Hasura RLS before approving.
 */

import { NextRequest, NextResponse } from "next/server";
import { workflowEngine } from "@workflow/backend";
import { getHasuraServerConfig } from "@/lib/server-config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { step_run_id } = body;

    if (!step_run_id) {
      return NextResponse.json({ message: "step_run_id is required" }, { status: 400 });
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(step_run_id)) {
      return NextResponse.json({ message: "Invalid step_run_id format" }, { status: 400 });
    }

    // Extract user JWT from Authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const userJwt = authHeader.slice(7);
    const { hasuraUrl } = getHasuraServerConfig();

    // Validate user access to the step run via Hasura RLS
    const checkRes = await fetch(hasuraUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userJwt}`,
      },
      body: JSON.stringify({
        query: `query CheckStepRun($id: uuid!) {
          step_runs_by_pk(id: $id) { id status }
          users { id }
        }`,
        variables: { id: step_run_id },
      }),
    });
    const checkData = await checkRes.json();

    if (checkData.errors || !checkData.data?.step_runs_by_pk) {
      return NextResponse.json(
        { message: checkData.errors?.[0]?.message || "Step run not found or access denied" },
        { status: 403 }
      );
    }

    const userId = checkData.data?.users?.[0]?.id || "a71aa3c4-6dd5-464d-99b5-5f12b4a5e0fb";

    // Direct engine execution
    const result = await workflowEngine.resumeAfterApproval(step_run_id, userId);

    return NextResponse.json({
      step_run_id: step_run_id,
      workflow_run_id: result.workflowRunId,
      status: result.status,
      message: `Approval recorded. Workflow run ${result.status}.`,
    });
  } catch (err) {
    console.error("[/api/approve-step]", err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
