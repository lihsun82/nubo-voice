import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

export async function GET(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "高擬人語音服務尚未設定憑證" },
      { status: 500 },
    );
  }

  const requestedVoice = new URL(request.url).searchParams.get("voice") ?? "marin";
  const voice = OPENAI_VOICES.has(requestedVoice) ? requestedVoice : "marin";
  const model = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2";

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier":
        process.env.OPENAI_SAFETY_IDENTIFIER ?? "nubo-owner",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model,
        output_modalities: ["audio"],
        audio: {
          output: { voice },
        },
      },
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("NUBO realtime token error", data);
    return NextResponse.json(
      { error: "高擬人即時語音憑證建立失敗" },
      { status: response.status },
    );
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
