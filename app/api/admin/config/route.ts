import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, isSameOriginAdminWrite } from "@/lib/nubo-admin-auth";
import { readGuestConfig, updateGuestConfig } from "@/lib/nubo-guest-config-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  if (!await getAdminSession(request)) {
    return NextResponse.json({ error: "請先登入後台" }, { status: 401, headers: noStore });
  }
  return NextResponse.json(await readGuestConfig(), { headers: noStore });
}

export async function PUT(request: NextRequest) {
  if (!isSameOriginAdminWrite(request)) {
    return NextResponse.json({ error: "設定來源無效" }, { status: 403, headers: noStore });
  }
  if (!await getAdminSession(request)) {
    return NextResponse.json({ error: "請先登入後台" }, { status: 401, headers: noStore });
  }
  try {
    const config = await updateGuestConfig(await request.json());
    return NextResponse.json(config, { headers: noStore });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error && error.name === "ZodError"
        ? "設定格式或數值不正確"
        : "設定儲存失敗",
    }, { status: 400, headers: noStore });
  }
}
