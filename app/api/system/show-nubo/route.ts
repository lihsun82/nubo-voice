import { NextResponse } from "next/server";
import { showNuboWindow } from "@/lib/desktop-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await showNuboWindow();
    return NextResponse.json({
      ok: true,
      ...result,
      message: result.action === "focused" ? "已喚出NUBO網頁" : "已開啟NUBO網頁",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "喚出NUBO網頁失敗" },
      { status: 500 },
    );
  }
}
