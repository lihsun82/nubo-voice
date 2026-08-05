import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      release: "V15.6.24",
      branch: "feat/mobile-agent-omniroute-v6",
      build: "youtube-deploy-verification-20260806",
      youtubeMode: "external-youtube-with-search-fallback",
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );
}
