import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.TAVUS_API_KEY?.trim() ?? "";
  const palId = process.env.TAVUS_PAL_ID?.trim() ?? "";
  const personaId = process.env.TAVUS_PERSONA_ID?.trim() ?? "";
  const replicaId = process.env.TAVUS_REPLICA_ID?.trim() ?? "";

  return NextResponse.json(
    {
      success: true,
      mode: personaId && replicaId ? "developer-api" : "pal",
      configured: {
        apiKey: Boolean(apiKey),
        apiKeyLength: apiKey.length,
        palId: palId || null,
        personaId: personaId || null,
        replicaId: replicaId || null,
      },
      nextStep:
        personaId && replicaId
          ? "可使用 Conversation API 建立真人視訊通話。"
          : "目前為 PAL 模式；請使用 Tavus Deploy 頁面的 Embed，而不是 Persona/Replica API。",
      buildMarker: "nubo-tavus-config-v2",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    },
  );
}
