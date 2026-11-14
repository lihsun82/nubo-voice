import { NextRequest, NextResponse } from "next/server";
import { isSameOriginAdminWrite, setGuestDeviceSession } from "@/lib/nubo-admin-auth";
import { consumeGuestPairingCode } from "@/lib/nubo-device-pairing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOriginAdminWrite(request)) {
    return NextResponse.json({ error: "配對來源無效" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const source = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!await consumeGuestPairingCode(code, source)) {
    return NextResponse.json({ error: "配對碼不正確、已過期或嘗試次數過多" }, {
      status: 401, headers: { "Cache-Control": "no-store" },
    });
  }
  const response = NextResponse.json({ paired: true }, { headers: { "Cache-Control": "no-store" } });
  await setGuestDeviceSession(response);
  return response;
}
