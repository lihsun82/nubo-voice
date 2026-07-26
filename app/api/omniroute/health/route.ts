import { NextResponse } from "next/server";
import { getOmniRouteBaseUrl } from "@/lib/omniroute-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = process.env.NUBO_OMNIROUTE_ENABLED === "1";
  const baseUrl = getOmniRouteBaseUrl();

  if (!enabled) {
    return NextResponse.json({
      enabled: false,
      ok: false,
      message: "OmniRoute is disabled; existing NUBO providers remain available.",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: process.env.OMNIROUTE_API_KEY
        ? { Authorization: `Bearer ${process.env.OMNIROUTE_API_KEY}` }
        : undefined,
      signal: controller.signal,
      cache: "no-store",
    });

    return NextResponse.json({
      enabled: true,
      ok: response.ok,
      status: response.status,
      baseUrl,
      model: process.env.OMNIROUTE_MODEL ?? "auto",
    }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({
      enabled: true,
      ok: false,
      baseUrl,
      error: error instanceof Error ? error.message : "Unknown OmniRoute health error",
    }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
