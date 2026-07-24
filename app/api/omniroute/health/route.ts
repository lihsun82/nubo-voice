import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = process.env.NUBO_OMNIROUTE_ENABLED === "1";
  const baseUrl = (process.env.OMNIROUTE_BASE_URL ?? "http://127.0.0.1:20128/v1").replace(/\/$/, "");

  if (!enabled) {
    return NextResponse.json({
      enabled: false,
      ok: false,
      message: "OmniRoute pilot is disabled; NUBO production flows are unchanged.",
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    const response = await fetch(`${baseUrl}/models`, {
      headers: process.env.OMNIROUTE_API_KEY
        ? { Authorization: `Bearer ${process.env.OMNIROUTE_API_KEY}` }
        : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    return NextResponse.json({
      enabled: true,
      ok: response.ok,
      status: response.status,
      baseUrl,
    }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      enabled: true,
      ok: false,
      baseUrl,
      error: error instanceof Error ? error.message : "Unknown OmniRoute health error",
    }, { status: 502 });
  }
}
