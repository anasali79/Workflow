import { NextRequest, NextResponse } from "next/server";
import { jobAgentService } from "@workflow/backend";

export async function GET() {
  try {
    const profile = jobAgentService.getProfile();
    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const updatedProfile = jobAgentService.updateProfile(body);
    return NextResponse.json({
      message: "Candidate profile and resume preferences updated successfully",
      profile: updatedProfile,
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to update profile" },
      { status: 500 }
    );
  }
}
