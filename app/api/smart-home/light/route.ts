import { NextResponse } from "next/server";
import { z } from "zod";
import { controlTapoSmartPlug, isTapoSmartPlugConfigured } from "@/lib/tapo-smart-plug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LightAction = "on" | "off" | "toggle";

const schema = z.object({
  action: z.enum(["on", "off", "toggle"]),
  room: z.string().max(80).optional(),
  device: z.string().max(80).optional(),
});

function getWebhookUrl(action: LightAction) {
  if (action === "on") return process.env.NUBO_LIGHT_ON_URL;
  if (action === "off") return process.env.NUBO_LIGHT_OFF_URL;
  return process.env.NUBO_LIGHT_TOGGLE_URL;
}

function getHomeAssistantDomain(entityId: string) {
  const domain = entityId.split(".")[0];
  if (domain === "switch" || domain === "light") return domain;
  return process.env.NUBO_HOME_ASSISTANT_DOMAIN || "switch";
}

function getHomeAssistantUrl(action: LightAction) {
  const baseUrl = process.env.NUBO_HOME_ASSISTANT_URL?.replace(/\/+$/, "");
  const entityId = process.env.NUBO_HOME_ASSISTANT_ENTITY_ID;
  if (!baseUrl || !entityId) return "";
  const domain = getHomeAssistantDomain(entityId);
  const service = action === "on" ? "turn_on" : action === "off" ? "turn_off" : "toggle";
  return `${baseUrl}/api/services/${domain}/${service}`;
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "燈光指令格式錯誤" }, { status: 400 });
  }

  const { action, room, device } = parsed.data;

  if (isTapoSmartPlugConfigured()) {
    try {
      const result = await controlTapoSmartPlug(action);
      return NextResponse.json({ ...result, room, device });
    } catch (cause) {
      return NextResponse.json(
        {
          error: cause instanceof Error ? `Tapo P100控制失敗：${cause.message}` : "Tapo P100控制失敗",
          provider: "tapo",
          action,
          room,
          device,
        },
        { status: 502 },
      );
    }
  }

  const homeAssistantUrl = getHomeAssistantUrl(action);
  const url = getWebhookUrl(action) || homeAssistantUrl;
  if (!url) {
    return NextResponse.json(
      {
        error:
          "尚未設定智慧插座/智慧燈控制方式。Tapo P100可設定 NUBO_TAPO_EMAIL / NUBO_TAPO_PASSWORD / NUBO_TAPO_DEVICE_IP；或設定 NUBO_LIGHT_ON_URL / NUBO_LIGHT_OFF_URL；或設定 NUBO_HOME_ASSISTANT_URL + NUBO_HOME_ASSISTANT_ENTITY_ID。",
      },
      { status: 503 },
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = process.env.NUBO_HOME_ASSISTANT_TOKEN || process.env.NUBO_SMART_HOME_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const body = homeAssistantUrl
    ? { entity_id: process.env.NUBO_HOME_ASSISTANT_ENTITY_ID }
    : { action, room, device, source: "nubo" };

  const response = await fetch(url, {
    method: process.env.NUBO_LIGHT_METHOD ?? "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    return NextResponse.json(
      { error: `智慧插座/智慧燈控制失敗：${response.status}`, detail: text.slice(0, 500) },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, provider: homeAssistantUrl ? "home-assistant" : "webhook", action, room, device });
}
