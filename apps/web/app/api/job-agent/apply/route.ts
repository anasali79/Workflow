import { NextRequest, NextResponse } from "next/server";
import { jobAgentService } from "@workflow/backend";

export async function GET() {
  try {
    const logs = jobAgentService.getApplicationLogs();
    return NextResponse.json({ logs });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to fetch application logs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, jobId, customCoverLetter, minScoreThreshold } = body;

    if (action === "bulk_apply") {
      const threshold = minScoreThreshold || 70;
      const result = await jobAgentService.bulkAutoApply(threshold);
      return NextResponse.json({
        message: `Bulk auto-apply complete. Submitted ${result.appliedCount} application(s).`,
        appliedCount: result.appliedCount,
        logs: result.logs,
      });
    }

    if (!jobId) {
      return NextResponse.json({ message: "jobId is required for single application" }, { status: 400 });
    }

    const log = await jobAgentService.applyToJob(jobId, customCoverLetter);
    return NextResponse.json({
      message: `Successfully applied to ${log.company} - ${log.jobTitle}`,
      log,
      allLogs: jobAgentService.getApplicationLogs(),
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to execute job application" },
      { status: 500 }
    );
  }
}
