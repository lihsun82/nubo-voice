import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type LightAction = "on" | "off";

function detectAction(body: any): LightAction | null {
  const raw = String(
    body?.action ??
    body?.state ??
    body?.intent ??
    body?.text ??
    body?.command ??
    ""
  ).toLowerCase();

  if (
    raw.includes("off") ||
    raw.includes("turn_off") ||
    raw.includes("關") ||
    raw.includes("關燈") ||
    raw.includes("關掉") ||
    raw.includes("關閉")
  ) {
    return "off";
  }

  if (
    raw.includes("on") ||
    raw.includes("turn_on") ||
    raw.includes("開") ||
    raw.includes("開燈") ||
    raw.includes("打開")
  ) {
    return "on";
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const action = detectAction(body);

    if (!action) {
      return NextResponse.json(
        {
          ok: false,
          error: "UNKNOWN_LIGHT_ACTION",
          message: "請提供 action: on/off，或文字包含開燈/關燈。",
          received: body,
        },
        { status: 400 }
      );
    }

    const iftttKey = process.env.IFTTT_KEY;
    const eventOn = process.env.TAPO_EVENT_ON || "tapo_p100_on";
    const eventOff = process.env.TAPO_EVENT_OFF || "tapo_p100_off";

    if (!iftttKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "IFTTT_KEY_NOT_SET",
          message: "缺少 IFTTT_KEY，請檢查 .env.local 並重新啟動 npm run dev。",
        },
        { status: 503 }
      );
    }

    const eventName = action === "on" ? eventOn : eventOff;
    const url = `https://maker.ifttt.com/trigger/${eventName}/with/key/${iftttKey}`;

    const iftttResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        value1: "NUBO",
        value2: action,
        value3: "tapo_p100",
      }),
    });

    const iftttText = await iftttResponse.text();

    if (!iftttResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "IFTTT_REQUEST_FAILED",
          status: iftttResponse.status,
          response: iftttText,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      action,
      eventName,
      response: iftttText,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "SMART_HOME_LIGHT_ERROR",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}