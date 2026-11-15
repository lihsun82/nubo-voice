import { NextRequest, NextResponse } from "next/server";
import { allowPmsQuery } from "@/lib/pms-query-auth";
import { findPmsReservation } from "@/lib/pms-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const windows = new Map<string, { since: number; count: number }>();

export async function POST(request: NextRequest) {
  if (!await allowPmsQuery(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = windows.get(ip);
  const next = current && now - current.since < 60_000
    ? { since: current.since, count: current.count + 1 }
    : { since: now, count: 1 };
  windows.set(ip, next);
  if (windows.size > 5000) {
    for (const [key, value] of windows) if (now - value.since > 60_000) windows.delete(key);
  }
  if (next.count > 10) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });

  const raw = await request.text();
  if (raw.length > 2048) return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }
  const bookingReference = typeof body.bookingReference === "string" ? body.bookingReference.trim() : "";
  const surname = typeof body.surname === "string" ? body.surname.trim() : "";
  if (!bookingReference || bookingReference.length > 100 || !surname || surname.length > 100) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers });
  }
  const result = await findPmsReservation(bookingReference, surname);
  if (!result.ready) return NextResponse.json({ error: "pms_data_unavailable" }, { status: 503, headers });
  return NextResponse.json({ propertyId: "ainubo-taichung-jinxin", ...result }, { headers });
}
