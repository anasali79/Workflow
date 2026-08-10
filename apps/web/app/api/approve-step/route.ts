/**
 * Next.js API Route: /api/approve-step
 *
 * Directly approves a paused approval_gate step using backend workflowEngine.
 * Validates the user's JWT and checks access to the step run through Hasura RLS.
 */

import { NextRequest, NextResponse } from "next/server";
import { workflowEngine } from "@workflow/backend";
import { getHasuraServerConfig } from "@/lib/server-config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { step_run_id } = body;

    // Validate step_run_id
    if (!step_run_id) {
      return NextResponse.json(
        { message: "step_run_id is required" },
        { status: 400 }
      );
    }

    const UUID_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!UUID_REGEX.test(step_run_id)) {
      return NextResponse.json(
        { message: "Invalid step_run_id format" },
        { status: 400 }
      );
    }

    // Extract user JWT from Authorization header
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const userJwt = authHeader.slice(7).trim();

    if (!userJwt) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { hasuraUrl } = getHasuraServerConfig();

    // Validate user access to the step run through Hasura RLS.
    // IMPORTANT:
    // Do not query `users` here because that field does not exist
    // in the Hasura query_root of this project.
    const checkRes = await fetch(hasuraUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userJwt}`,
      },
      body: JSON.stringify({
        query: `
          query CheckStepRun($id: uuid!) {
            step_runs_by_pk(id: $id) {
              id
              status
            }
          }
        `,
        variables: {
          id: step_run_id,
        },
      }),
    });

    if (!checkRes.ok) {
      console.error(
        "[/api/approve-step] Hasura request failed:",
        checkRes.status,
        checkRes.statusText
      );

      return NextResponse.json(
        { message: "Failed to validate step run access" },
        { status: 403 }
      );
    }

    const checkData = await checkRes.json();

    // Hasura returned a GraphQL error or the step run
    // is not accessible through the user's RLS permissions.
    if (checkData.errors || !checkData.data?.step_runs_by_pk) {
      return NextResponse.json(
        {
          message:
            checkData.errors?.[0]?.message ||
            "Step run not found or access denied",
        },
        { status: 403 }
      );
    }

    // Extract user ID from the Nhost JWT.
    // Nhost user ID is stored in the JWT `sub` claim.
    let userId: string | undefined;

    try {
      const tokenParts = userJwt.split(".");

      if (tokenParts.length !== 3) {
        throw new Error("Invalid JWT");
      }

      const payload = JSON.parse(
        Buffer.from(tokenParts[1], "base64url").toString("utf8")
      );

      userId = payload.sub;
    } catch (error) {
      console.error("[/api/approve-step] Failed to decode JWT:", error);

      return NextResponse.json(
        { message: "Invalid user JWT" },
        { status: 401 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { message: "User ID not found in JWT" },
        { status: 401 }
      );
    }


    // Resume workflow after approval.
    const result = await workflowEngine.resumeAfterApproval(
      step_run_id,
      userId
    );

    return NextResponse.json({
      step_run_id,
      workflow_run_id: result.workflowRunId,
      status: result.status,
      message: `Approval recorded. Workflow run ${result.status}.`,
    });
  } catch (err) {
    console.error("[/api/approve-step]", err);

    return NextResponse.json(
      {
        message:
          err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}