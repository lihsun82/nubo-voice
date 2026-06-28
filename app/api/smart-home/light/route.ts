import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["on", "off", "toggle"]),
  room: z.string().max(80).optional(),
  device: z.string().max(80).optional(),
});

function getWebhookUrl(action: "on" | "off" | "toggle") {
  if (action === "on") return process.env.NUBO_LIGHT_ON_URL;
  if (action === "off") return process.env.NUBO_LIGHT_OFF_URL;
  return process.env.NUBO_LIGHT_TOGGLE_URL;
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "燈光指令格式錯誤" }, { status: 400 });
  }

  const { action, room, device } = parsed.data;
  const url = getWebhookUrl(action);
  if (!url) {
    return NextResponse.json(
      {
        error: `尚未設定 ${action === "on" ? "NUBO_LIGHT_ON_URL" : action === "off" ? "NUBO_LIGHT_OFF_URL" : "NUBO_LIGHT_TOGGLE_URL"}`,
      },
      { status: 503 },
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.NUBO_SMART_HOME_TOKEN) {
    headers.Authorization = `Bearer ${process.env.NUBO_SMART_HOME_TOKEN}`;
  }

  const response = await fetch(url, {
    method: process.env.NUBO_LIGHT_METHOD ?? "POST",
    headers,
    body: JSON.stringify({ action, room, device, source: "nubo" }),
    cache: "no-store",
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    return NextResponse.json(
      { error: `智慧燈控制失敗：${response.status}`, detail: text.slice(0, 500) },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, action, room, device });
}
