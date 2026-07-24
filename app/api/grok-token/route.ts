import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "XAI_API_KEY 尚未設定" }, { status: 503 });
  }

  const response = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expires_after: { seconds: 300 } }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.value !== "string") {
    const message = payload?.error?.message ?? `xAI Token 錯誤：${response.status}`;
    return NextResponse.json({ error: message }, { status: response.status || 502 });
  }

  return NextResponse.json({
    token: payload.value,
    expiresAt: payload.expires_at,
    model: process.env.XAI_VOICE_MODEL ?? "grok-voice-latest",
    voice: process.env.XAI_VOICE ?? "eve",
  });
}
