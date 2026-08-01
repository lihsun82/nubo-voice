import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUILD_ID = "public-web-navigation-v2-20260801";

export async function GET(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || "";
  const forwardedProto = request.headers.get("x-forwarded-proto") || "";

  return NextResponse.json(
    {
      ok: true,
      build: BUILD_ID,
      host,
      protocol: forwardedProto || request.nextUrl.protocol.replace(":", ""),
      provider: process.env.RAILWAY_ENVIRONMENT_NAME ? "railway" : "unknown",
      railwayEnvironment: process.env.RAILWAY_ENVIRONMENT_NAME || undefined,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "X-NUBO-Build": BUILD_ID,
      },
    },
  );
}
