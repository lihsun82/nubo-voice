import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY 尚未設定" }, { status: 503 });
  }

  const model = process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";
  // 2026-07 官方 WebSocket quickstart 使用 v1beta；保留環境變數可快速切回 v1alpha。
  const wsVersion = process.env.GEMINI_LIVE_WS_VERSION ?? "v1beta";
  const websocketUrl =
    `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${wsVersion}.GenerativeService.BidiGenerateContentConstrained`;
  const now = Date.now();
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(now + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
      }),
      cache: "no-store",
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload?.name !== "string") {
    const message = payload?.error?.message ?? `Gemini Token 錯誤：${response.status}`;
    return NextResponse.json({ error: message }, { status: response.status || 502 });
  }

  return NextResponse.json({
    token: payload.name,
    model,
    expiresAt: payload.expireTime ?? new Date(now + 30 * 60_000).toISOString(),
    websocketUrl,
    wsVersion,
  });
}
