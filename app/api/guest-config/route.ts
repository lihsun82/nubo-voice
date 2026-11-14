import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasGuestDeviceSession } from "@/lib/nubo-admin-auth";
import { readGuestConfig } from "@/lib/nubo-guest-config-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await hasGuestDeviceSession(request) && !await getAdminSession(request)) {
    return NextResponse.json({ error: "這台平板尚未配對" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json(await readGuestConfig(), {
    headers: { "Cache-Control": "no-store" },
  });
}
