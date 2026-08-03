import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    route: "/api/tavus/health",
    tavusApiKeyConfigured: Boolean(process.env.TAVUS_API_KEY),
    tavusPalIdConfigured: Boolean(process.env.TAVUS_PAL_ID),
    timestamp: new Date().toISOString(),
  });
}
