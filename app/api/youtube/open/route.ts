import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({
    ok: false,
    disabled: true,
    message: "媒體自動播放已停用，不會開啟任何額外視窗。",
  });
}
