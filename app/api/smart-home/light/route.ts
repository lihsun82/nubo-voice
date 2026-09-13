import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LightAction = "on" | "off";

function detectAction(body: Record<string, unknown>): LightAction | null {
  const raw = String(
    body.action ??
      body.state ??
      body.intent ??
      body.text ??
      body.command ??
      "",
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

function getBridgeConfig() {
  const iftttKey =
    process.env.IFTTT_KEY ||
    process.env.NUBO_IFTTT_KEY ||
    process.env.IFTTT_WEBHOOK_KEY ||
    "";
  const eventOn =
    process.env.TAPO_EVENT_ON ||
    process.env.NUBO_LIGHT_EVENT_ON ||
    "tapo_p100_on";
  const eventOff =
    process.env.TAPO_EVENT_OFF ||
    process.env.NUBO_LIGHT_EVENT_OFF ||
    "tapo_p100_off";

  return {
    configured: Boolean(iftttKey),
    iftttKey,
    eventOn,
    eventOff,
  };
}

export async function GET() {
  const config = getBridgeConfig();
  return NextResponse.json({
    ok: true,
    available: config.configured,
    enabled: config.configured,
    mode: "webhook",
    provider: "smart-home-bridge",
    message: config.configured
      ? "Google Home 智慧燈橋接已就緒。"
      : "智慧燈橋接尚未設定金鑰。",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const action = detectAction(body);

    if (!action) {
      return NextResponse.json(
        {
          ok: false,
          error: "UNKNOWN_LIGHT_ACTION",
          message: "請提供 action: on/off，或文字包含開燈/關燈。",
        },
        { status: 400 },
      );
    }

    const config = getBridgeConfig();
    if (!config.configured) {
      return NextResponse.json(
        {
          ok: false,
          error: "SMART_HOME_BRIDGE_NOT_CONFIGURED",
          message: "Google Home 智慧燈橋接尚未設定。",
        },
        { status: 503 },
      );
    }

    const eventName = action === "on" ? config.eventOn : config.eventOff;
    const room = String(body.room ?? "").trim();
    const device = String(body.device ?? "").trim();
    const url = `https://maker.ifttt.com/trigger/${encodeURIComponent(
      eventName,
    )}/with/key/${encodeURIComponent(config.iftttKey)}`;

    const bridgeResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        value1: room || "NUBO",
        value2: action,
        value3: device || "tapo_p100",
      }),
      cache: "no-store",
    });

    const responseText = await bridgeResponse.text();
    if (!bridgeResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "SMART_HOME_BRIDGE_REQUEST_FAILED",
          status: bridgeResponse.status,
          message: "智慧燈橋接呼叫失敗。",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      available: true,
      enabled: true,
      mode: "webhook",
      action,
      room: room || null,
      device: device || null,
      eventName,
      controlled: 1,
      matched: 1,
      message: action === "on" ? "已送出開燈指令。" : "已送出關燈指令。",
      bridgeResponse: responseText.slice(0, 180),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "SMART_HOME_LIGHT_ERROR",
        message: error instanceof Error ? error.message : "智慧燈控制失敗",
      },
      { status: 500 },
    );
  }
}
