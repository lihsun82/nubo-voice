import { NextRequest, NextResponse } from "next/server";
import { allowPmsQuery } from "@/lib/pms-query-auth";
import { consumeHotelKioskInventoryBudget, isHotelKioskInventoryRequest } from "@/lib/pms-kiosk-inventory-auth";
import { findPmsAvailability, validPmsQueryDateRange } from "@/lib/pms-snapshot";
import { queryLivePmsAvailability } from "@/lib/pms-live-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  // Public hotel voice-kiosk inventory is read-only and excludes guest PII.
  // Keep the original authenticated path for admins and trusted PMS callers.
  const authenticated = await allowPmsQuery(request);
  const kioskRead = !authenticated && isHotelKioskInventoryRequest(request);
  if (!authenticated && !kioskRead) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  }
  if (kioskRead && !consumeHotelKioskInventoryBudget(request)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
  }
  const raw = await request.text();
  if (raw.length > 2048) return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers });
  }
  const { checkIn, checkOut, adults } = body;
  if (!validPmsQueryDateRange(checkIn, checkOut) ||
      !Number.isInteger(adults) || (adults as number) < 1 || (adults as number) > 20) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers });
  }
  let result;
  try {
    result = await queryLivePmsAvailability(checkIn as string, checkOut as string, adults as number, fetch, true);
  } catch {
    return NextResponse.json({ error: "pms_data_unavailable" }, { status: 503, headers });
  }
  if (request.headers.get("accept") === "application/vnd.nubosci.room-types.v1+json" && !result?.covered) {
    return NextResponse.json({ error: "pms_data_unavailable" }, { status: 503, headers });
  }
  // Never expose snapshot fallback or incomplete inventory to unauthenticated visitors.
  // Only a fresh room-type breakdown returned by the PMS live endpoint qualifies.
  if (kioskRead && (!result || result.source !== "live" || !result.covered ||
      result.inventoryView !== "guest-room-types-v1" ||
      !Array.isArray(result.roomTypes) || result.roomTypes.length === 0)) {
    return NextResponse.json({ error: "pms_data_unavailable" }, { status: 503, headers });
  }
  result ??= await findPmsAvailability(checkIn as string, checkOut as string, adults as number);
  if (!result.ready) return NextResponse.json({ error: "pms_data_unavailable" }, { status: 503, headers });
  return NextResponse.json({ propertyId: "ainubo-taichung-jinxin", ...result }, { headers });
}
