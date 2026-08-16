import { NextRequest, NextResponse } from "next/server";
import { jobAgentService } from "@workflow/backend";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain") || undefined;
    const jobs = await jobAgentService.extractFreshJobs(domain);
    return NextResponse.json({
      count: jobs.length,
      domainFilter: domain || "All User Preferences",
      jobs,
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to extract fresh jobs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { domain } = body;
    const jobs = await jobAgentService.extractFreshJobs(domain);
    return NextResponse.json({
      message: `Extracted ${jobs.length} fresh job openings successfully`,
      count: jobs.length,
      jobs,
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to extract jobs" },
      { status: 500 }
    );
  }
}
