import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (process.env.NUBO_GUEST_BOOKING_ENABLED !== "true") {
    return NextResponse.json({ enabled: false }, { headers });
  }
  const raw = process.env.NUBO_GUEST_BOOKING_URL?.trim();
  try {
    if (!raw) throw new Error("missing booking URL");
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      throw new Error("invalid booking URL");
    }
    return NextResponse.json({ enabled: true, url: url.toString() }, { headers });
  } catch {
    return NextResponse.json({ enabled: false }, { headers });
  }
}
