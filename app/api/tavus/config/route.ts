import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAVUS_API_BASE = "https://tavusapi.com/v2";

async function tavusGet(path: string, apiKey: string) {
  const response = await fetch(`${TAVUS_API_BASE}${path}`, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Tavus ${path} failed (${response.status}): ${JSON.stringify(data)}`
    );
  }

  return data;
}

export async function GET() {
  const apiKey = process.env.TAVUS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "缺少 TAVUS_API_KEY" },
      { status: 500 }
    );
  }

  try {
    const [personas, replicas] = await Promise.all([
      tavusGet("/personas?limit=100&page=1", apiKey),
      tavusGet("/replicas?limit=100&page=1", apiKey),
    ]);

    return NextResponse.json({
      success: true,
      configured: {
        palId: process.env.TAVUS_PAL_ID ?? null,
        personaId: process.env.TAVUS_PERSONA_ID ?? null,
        replicaId: process.env.TAVUS_REPLICA_ID ?? null,
      },
      personas,
      replicas,
    });
  } catch (error) {
    console.error("Tavus config discovery error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "讀取 Tavus 設定失敗",
      },
      { status: 502 }
    );
  }
}
