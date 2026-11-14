import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, isSameOriginAdminWrite, setGuestDeviceSession } from "@/lib/nubo-admin-auth";
import { createGuestPairingCode } from "@/lib/nubo-device-pairing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOriginAdminWrite(request) || !await getAdminSession(request)) {
    return NextResponse.json({ error: "請先登入後台" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const body = await request.json().catch(() => ({}));
  if (body.thisDevice === true) {
    const response = NextResponse.json({ paired: true }, { headers: { "Cache-Control": "no-store" } });
    await setGuestDeviceSession(response);
    return response;
  }
  const code = await createGuestPairingCode();
  return NextResponse.json(code, { headers: { "Cache-Control": "no-store" } });
}
