import { PMS_PROPERTY_ID } from "./pms-snapshot.ts";

type RoomType = { code: string; name: string; availableCount: number };
export const guestRoomTypeView = "guest-room-types-v1";

export class PmsLiveError extends Error {
  readonly code: "pms_data_unavailable" | "room_catalogue_incomplete" | "room_type_breakdown_unavailable" | "room_type_allocation_unavailable" | "invalid_query" | "rate_limited";
  constructor(code: PmsLiveError["code"]) {
    super(code);
    this.code = code;
  }
}

export async function rejectPmsResponse(response: Response): Promise<never> {
  if (response.status === 400) throw new PmsLiveError("invalid_query");
  if (response.status === 429) throw new PmsLiveError("rate_limited");
  if (response.status === 503) {
    const raw = await response.text().catch(() => "");
    if (raw.length <= 2048) {
      try {
        const body = JSON.parse(raw) as { reason?: unknown };
        if (body.reason === "room_catalogue_incomplete" || body.reason === "room_type_allocation_unavailable" ||
            body.reason === "room_type_breakdown_unavailable") {
          throw new PmsLiveError(body.reason);
        }
      } catch (error) {
        if (error instanceof PmsLiveError) throw error;
      }
    }
  } else {
    void response.body?.cancel().catch(() => undefined);
  }
  throw new PmsLiveError("pms_data_unavailable");
}

function configuredEndpoint() {
  const rawUrl = process.env.NUBO_PMS_AVAILABILITY_URL?.trim();
  const token = process.env.NUBO_PMS_AVAILABILITY_TOKEN?.trim();
  if (!rawUrl && !token) return null;
  if (!rawUrl || !token || token.length < 32) throw new Error("pms_live_not_configured");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("pms_live_not_configured");
  }
  return { url: url.toString(), token };
}

export function roomTypesFrom(value: unknown): RoomType[] {
  if (!Array.isArray(value) || value.length > 60) throw new Error("pms_live_invalid_response");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("pms_live_invalid_response");
    }
    const row = item as Record<string, unknown>;
    if (typeof row.code !== "string" || !row.code.trim() || row.code.length > 60 ||
        typeof row.name !== "string" || !row.name.trim() || row.name.length > 120 ||
        !Number.isInteger(row.availableCount) || (row.availableCount as number) < 0 ||
        (row.availableCount as number) > 1000) {
      throw new Error("pms_live_invalid_response");
    }
    return {
      code: row.code.trim(),
      name: row.name.trim(),
      availableCount: row.availableCount as number,
    };
  });
}

export async function queryLivePmsAvailability(
  checkIn: string,
  checkOut: string,
  adults: number,
  fetcher: typeof fetch = fetch,
  guestRoomTypes = false,
) {
  const endpoint = configuredEndpoint();
  if (!endpoint) return null;

  const response = await fetcher(endpoint.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${endpoint.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(guestRoomTypes ? { "X-Nubo-Inventory-View": guestRoomTypeView } : {}),
    },
    body: JSON.stringify({ propertyId: PMS_PROPERTY_ID, checkIn, checkOut, adults }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) await rejectPmsResponse(response);
  if (Number(response.headers.get("content-length") || 0) > 65_536) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("pms_live_unavailable");
  }
  const raw = await response.text();
  if (raw.length > 65_536) throw new Error("pms_live_invalid_response");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("pms_live_invalid_response"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("pms_live_invalid_response");
  }
  const result = value as Record<string, unknown>;
  if (guestRoomTypes && result.inventoryView !== guestRoomTypeView) throw new PmsLiveError("room_type_allocation_unavailable");
  if (result.propertyId !== PMS_PROPERTY_ID || result.checkIn !== checkIn ||
      result.checkOut !== checkOut || result.adults !== adults ||
      typeof result.asOf !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(result.asOf) ||
      (result.covered !== undefined && typeof result.covered !== "boolean")) {
    throw new Error("pms_live_invalid_response");
  }
  const asOf = Date.parse(result.asOf);
  const age = Date.now() - asOf;
  if (!Number.isFinite(asOf) || age < -60_000 || age > 5 * 60_000) {
    throw new Error("pms_live_stale");
  }
  if (result.covered === false) {
    return { ready: true as const, covered: false as const, asOf: result.asOf, source: "live" as const };
  }
  return {
    ready: true as const,
    covered: true as const,
    asOf: result.asOf,
    roomTypes: roomTypesFrom(result.roomTypes),
    source: "live" as const,
    ...(guestRoomTypes ? { inventoryView: guestRoomTypeView } : {}),
  };
}
