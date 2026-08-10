import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route middleware pass-through.
 * Full session validation happens client-side via Nhost Auth (AuthGate component).
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
