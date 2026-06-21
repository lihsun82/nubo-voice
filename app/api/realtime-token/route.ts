import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "伺服器尚未設定 OPENAI_API_KEY" },
      { status: 500 },
    );
  }

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
        model: "gpt-realtime-2",
        audio: {
          output: { voice: "marin" },
        },
      },
    }),
    cache: "no-store",
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("OpenAI realtime token error", data);
    return NextResponse.json(
      { error: "OpenAI 即時語音憑證建立失敗" },
      { status: response.status },
    );
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
