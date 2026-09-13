import { NextRequest, NextResponse } from "next/server";
import { addV12Log, addV12Notification } from "@/lib/v12/v12-store";

export const runtime = "nodejs";

function detectIntent(text: string) {
  const raw = text.toLowerCase();

  if (
    raw.includes("開燈") ||
    raw.includes("打開燈") ||
    raw.includes("打開投射燈") ||
    raw.includes("開投射燈") ||
    raw.includes("turn on")
  ) {
    return {
      type: "smart_home",
      action: "on",
      label: "開啟投射燈",
    };
  }

  if (
    raw.includes("關燈") ||
    raw.includes("關掉燈") ||
    raw.includes("關閉燈") ||
    raw.includes("關掉投射燈") ||
    raw.includes("關閉投射燈") ||
    raw.includes("turn off")
  ) {
    return {
      type: "smart_home",
      action: "off",
      label: "關閉投射燈",
    };
  }

  if (
    raw.includes("今日簡報") ||
    raw.includes("今天簡報") ||
    raw.includes("briefing")
  ) {
    return {
      type: "briefing",
      action: "read",
      label: "讀取今日簡報",
    };
  }

  if (
    raw.includes("任務") ||
    raw.includes("待辦") ||
    raw.includes("tasks")
  ) {
    return {
      type: "tasks",
      action: "open",
      label: "查看任務",
    };
  }

  return {
    type: "unknown",
    action: "unknown",
    label: "未知指令",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = String(body.text || body.command || "").trim();

    if (!text) {
      return NextResponse.json(
        {
          ok: false,
          error: "VOICE_TEXT_REQUIRED",
          message: "請提供 text 或 command。",
        },
        { status: 400 }
      );
    }

    const intent = detectIntent(text);

    addV12Log({
      source: "Voice Core",
      action: intent.label,
      status: intent.type === "unknown" ? "warning" : "success",
      detail: `收到語音文字：「${text}」，判斷意圖：${intent.type}/${intent.action}`
    });

    if (intent.type === "unknown") {
      addV12Notification({
        level: "warning",
        title: "無法判斷語音指令",
        message: `NUBO 尚未支援：「${text}」。`
      });

      return NextResponse.json({
        ok: true,
        handled: false,
        text,
        intent,
        message: "我聽到了，但目前還不確定要執行哪個功能。",
      });
    }

    if (intent.type === "smart_home") {
      const origin = new URL(request.url).origin;

      const smartHomeResponse = await fetch(`${origin}/api/smart-home/light`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: intent.action }),
      });

      const smartHomeData = await smartHomeResponse.json().catch(() => ({}));

      return NextResponse.json({
        ok: smartHomeResponse.ok,
        handled: true,
        text,
        intent,
        message:
          intent.action === "on"
            ? "已送出開燈指令。"
            : "已送出關燈指令。",
        result: smartHomeData,
      });
    }

    if (intent.type === "briefing") {
      return NextResponse.json({
        ok: true,
        handled: true,
        text,
        intent,
        message: "已準備讀取今日簡報。",
      });
    }

    return NextResponse.json({
      ok: true,
      handled: true,
      text,
      intent,
      message: "指令已接收。",
    });
  } catch (error: any) {
    addV12Log({
      source: "Voice Core",
      action: "語音核心錯誤",
      status: "error",
      detail: error?.message || String(error)
    });

    return NextResponse.json(
      {
        ok: false,
        error: "VOICE_CORE_ERROR",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
