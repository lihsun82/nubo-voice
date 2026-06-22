import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.YOUTUBE_API_KEY),
    autoplayMode: process.platform === "win32",
    playerUrl: process.env.NUBO_PUBLIC_URL ?? "http://127.0.0.1:3000",
  });
}
