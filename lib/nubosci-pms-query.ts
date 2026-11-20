import { createHash, timingSafeEqual } from "node:crypto";
import { PMS_PROPERTY_ID, validPmsQueryDateRange } from "./pms-snapshot.ts";
import { PmsLiveError, queryLivePmsAvailability } from "./pms-live-availability.ts";
import { queryLivePmsRestAvailability, validRestQuery } from "./pms-live-rest-availability.ts";

const MAX_BODY_BYTES = 2048;
const MAX_PER_MINUTE = 48;
const requests: number[] = [];
type Kind = "stay" | "rest";

function json(body: object, status = 200, retryAfter?: number) {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfter !== undefined) headers["Retry-After"] = String(retryAfter);
  return Response.json(body, { status, headers });
}

function authorized(request: Request) {
  if (request.headers.has("origin")) return false;
  const digest = process.env.NUBOSCI_VOICE_PARTNER_KEY_SHA256?.trim();
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/i)?.[1];
  if (!digest || !/^[a-f0-9]{64}$/i.test(digest) || !token) return false;
  return timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(digest, "hex"));
}

function todayInTaipei() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (part: string) => parts.find((item) => item.type === part)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function validStay(checkIn: unknown, checkOut: unknown, adults: unknown) {
  if (!validPmsQueryDateRange(checkIn, checkOut) ||
      typeof checkIn !== "string" || typeof checkOut !== "string" ||
      checkIn < todayInTaipei() ||
      (Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000 > 365 ||
      !Number.isInteger(adults) || (adults as number) < 1 || (adults as number) > 20) return false;
  return true;
}

export function createNubosciPmsQueryHandler(kind: Kind) {
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!process.env.NUBOSCI_VOICE_PARTNER_KEY_SHA256) {
      return json({ error: "pms_data_unavailable" }, 503);
    }
    if (!authorized(request)) return json({ error: "unauthorized" }, 401);
    if (new URL(request.url).search ||
        !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(
          request.headers.get("content-type") || "")) {
      return json({ error: "invalid_request" }, 400);
    }
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
      return json({ error: "invalid_payload" }, 400);
    }
    const raw = await request.text().catch(() => "");
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return json({ error: "invalid_payload" }, 400);
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "invalid_payload" }, 400);
    }
    if (body.propertyId !== PMS_PROPERTY_ID) return json({ error: "invalid_property" }, 400);
    if (kind === "stay"
      ? !validStay(body.checkIn, body.checkOut, body.adults)
      : !validRestQuery(body.startAt, body.durationMinutes)) {
      return json({ error: "invalid_payload" }, 400);
    }

    const now = Date.now();
    while (requests.length && now - requests[0] >= 60_000) requests.shift();
    if (requests.length >= MAX_PER_MINUTE) return json({ error: "rate_limited" }, 429, 60);
    requests.push(now);
    const guestRoomTypes = request.headers.get("accept") === "application/vnd.nubosci.room-types.v1+json";
    try {
      if (kind === "stay") {
        const result = await queryLivePmsAvailability(
          body.checkIn as string, body.checkOut as string, body.adults as number, fetch, guestRoomTypes);
        if (!result || !result.covered) return json({ error: "pms_data_unavailable" }, 503);
        return json({ propertyId: PMS_PROPERTY_ID, ...result });
      }
      const result = await queryLivePmsRestAvailability(
        body.startAt as string, body.durationMinutes as number, fetch, guestRoomTypes);
      if (!result) return json({ error: "pms_data_unavailable" }, 503);
      return json(result);
    } catch (error) {
      if (error instanceof PmsLiveError && (error.code === "room_catalogue_incomplete" ||
          error.code === "room_type_breakdown_unavailable" || error.code === "room_type_allocation_unavailable")) {
        return json({ error: "pms_data_unavailable", reason: error.code }, 503);
      }
      if (error instanceof PmsLiveError && error.code === "invalid_query") {
        return json({ error: "invalid_payload" }, 400);
      }
      if (error instanceof PmsLiveError && error.code === "rate_limited") {
        return json({ error: "rate_limited" }, 429, 60);
      }
      return json({ error: "pms_data_unavailable" }, 503);
    }
  };
}
