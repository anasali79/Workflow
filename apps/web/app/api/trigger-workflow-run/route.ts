/**
 * Next.js API Route: /api/trigger-workflow-run
 *
 * Directly executes a workflow run using backend workflowEngine.
 * Validates the user's JWT via Hasura RLS before starting the execution.
 */

import { NextRequest, NextResponse } from "next/server";
import { workflowEngine } from "@workflow/backend";
import { getHasuraServerConfig } from "@/lib/server-config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workflow_id } = body;

    if (!workflow_id) {
      return NextResponse.json({ message: "workflow_id is required" }, { status: 400 });
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(workflow_id)) {
      return NextResponse.json({ message: "Invalid workflow_id format" }, { status: 400 });
    }

    // Extract user JWT from Authorization header
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    const userJwt = authHeader.slice(7);
    const { hasuraUrl } = getHasuraServerConfig();

    // Validate user access to the workflow via Hasura RLS
    const checkRes = await fetch(hasuraUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userJwt}`,
      },
      body: JSON.stringify({
        query: `query GetWorkflow($id: uuid!) { workflows_by_pk(id: $id) { id organization_id } }`,
        variables: { id: workflow_id },
      }),
    });
    const checkData = await checkRes.json();

    if (checkData.errors || !checkData.data?.workflows_by_pk) {
      return NextResponse.json(
        { message: checkData.errors?.[0]?.message || "Workflow not found or access denied" },
        { status: 403 }
      );
    }

    // Direct engine execution
    const result = await workflowEngine.triggerRun({
      workflowId: workflow_id,
      triggerType: "manual",
      triggeredBy: null,
    });

    return NextResponse.json({
      run_id: result.workflowRunId,
      workflow_run_id: result.workflowRunId,
      status: result.status,
      message: `Workflow run ${result.status}`,
    });
  } catch (err) {
    console.error("[/api/trigger-workflow-run]", err);
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
