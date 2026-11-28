import { NextRequest, NextResponse } from "next/server";
import { allowPmsQuery } from "@/lib/pms-query-auth";
import { consumeHotelKioskInventoryBudget, isHotelKioskInventoryRequest } from "@/lib/pms-kiosk-inventory-auth";
import { guestRoomTypeView, PmsLiveError } from "@/lib/pms-live-availability";
import { queryLivePmsRestAvailability, validRestQuery } from "@/lib/pms-live-rest-availability";
import { floorsForRequiredAmenities, guestRoomTypeFloorView } from "@/lib/pms-facility-floors";

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
  if (raw.length > 2048) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers });
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !validRestQuery(body.startAt, body.durationMinutes)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers });
  }
  const floors = floorsForRequiredAmenities(body.requiredAmenities);
  if (floors === null) return NextResponse.json({ error: "invalid_amenities" }, { status: 400, headers });
  const floorQuery = floors.length > 0;
  try {
    const byRoomType = request.headers.get("accept") === "application/vnd.nubosci.room-types.v1+json";
    const result = await queryLivePmsRestAvailability(
      body.startAt as string, body.durationMinutes as number, fetch, byRoomType, floors);
    if (!result) throw new PmsLiveError("pms_data_unavailable");
    if ((kioskRead || floorQuery) && (!("inventoryView" in result) ||
        result.inventoryView !== (floorQuery ? guestRoomTypeFloorView : guestRoomTypeView) ||
        !("roomTypes" in result) || !Array.isArray(result.roomTypes) ||
        result.roomTypes.length === 0)) {
      throw new PmsLiveError("pms_data_unavailable");
    }
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (!floorQuery && error instanceof PmsLiveError && error.code === "invalid_query") {
      console.warn("[pms/rest-availability] upstream rejected valid rest query");
      return NextResponse.json({ error: "pms_upstream_query_rejected" }, { status: 502, headers });
    }
    if (error instanceof PmsLiveError && error.code === "rate_limited") {
      return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
    }
    return NextResponse.json({ error: floorQuery ? "floor_inventory_unavailable" : "pms_data_unavailable" }, { status: 503, headers });
  }
}
