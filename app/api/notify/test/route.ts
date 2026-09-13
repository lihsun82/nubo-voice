import { NextResponse } from "next/server";
import { pushLineTextMessage } from "@/lib/line-push-notify";

export const runtime = "nodejs";

export async function POST() {
  try {
    await pushLineTextMessage(
      [
        "✅ AINUBO LINE 通知測試成功",
        "",
        "這代表 AINUBO 已經可以主動推 LINE 通知給你。",
      ].join("\n")
    );

    return NextResponse.json({
      ok: true,
      message: "LINE push notification sent.",
    });
  } catch (error) {
    console.error("[notify/test] failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}