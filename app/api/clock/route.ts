import { NextRequest, NextResponse } from "next/server";
import { getNuboClockSnapshot } from "@/lib/nubo-clock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * NUBO's one authoritative date source. The server clock is intentionally
 * independent of guest devices and of the model's training-data date.
 */
export function GET(request: NextRequest) {
  const snapshot = getNuboClockSnapshot(request.nextUrl.searchParams.get("timezone"));
  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
