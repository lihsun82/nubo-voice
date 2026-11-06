import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retired unsafe legacy proxy.
 * Previously any visitor could use our server-held OPENAI_API_KEY to create
 * paid Realtime sessions. The new owner-authenticated gateway lives at
 * /api/realtime-token and must be used instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "此舊版 OpenAI 語音連線入口已停用。請使用 NUBO 主頁的私人語音模式。",
      code: "legacy_voice_proxy_disabled",
    },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
