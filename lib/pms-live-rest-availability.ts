import { PMS_PROPERTY_ID } from "./pms-snapshot.ts";
import { PmsLiveError, rejectPmsResponse } from "./pms-live-availability.ts";

const START_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:Z|[+-]\d{2}:\d{2})$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function validRestQuery(startAt: unknown, durationMinutes: unknown) {
  if (!Number.isInteger(durationMinutes) || (durationMinutes as number) < 60 ||
      (durationMinutes as number) > 720) return false;
  if (startAt === "now") return true;
  if (typeof startAt !== "string" || !START_AT.test(startAt)) return false;
  const time = Date.parse(startAt);
  return Number.isFinite(time) && time >= Date.now() - 60_000 &&
    time <= Date.now() + 365 * 24 * 60 * 60_000;
}

function configuredEndpoint() {
  const rawUrl = process.env.NUBO_PMS_REST_AVAILABILITY_URL?.trim();
  const token = process.env.NUBO_PMS_AVAILABILITY_TOKEN?.trim();
  if (!rawUrl && !token) return null;
  if (!rawUrl || !token || token.length < 32) throw new PmsLiveError("pms_data_unavailable");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new PmsLiveError("pms_data_unavailable");
  }
  return { url: url.toString(), token };
}

export async function queryLivePmsRestAvailability(
  startAt: string,
  durationMinutes: number,
  fetcher: typeof fetch = fetch,
) {
  const endpoint = configuredEndpoint();
  if (!endpoint) return null;
  const requestedAt = Date.now();
  const response = await fetcher(endpoint.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${endpoint.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ propertyId: PMS_PROPERTY_ID, startAt, durationMinutes }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) await rejectPmsResponse(response);
  if (Number(response.headers.get("content-length") || 0) > 65_536) {
    void response.body?.cancel().catch(() => undefined);
    throw new PmsLiveError("pms_data_unavailable");
  }
  const raw = await response.text();
  if (raw.length > 65_536) throw new PmsLiveError("pms_data_unavailable");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new PmsLiveError("pms_data_unavailable"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PmsLiveError("pms_data_unavailable");
  }
  const result = value as Record<string, unknown>;
  if (result.propertyId !== PMS_PROPERTY_ID || result.durationMinutes !== durationMinutes ||
      typeof result.startAt !== "string" || !TIMESTAMP.test(result.startAt) ||
      typeof result.asOf !== "string" || !TIMESTAMP.test(result.asOf) ||
      !Number.isInteger(result.availableCount) || (result.availableCount as number) < 0 ||
      (result.availableCount as number) > 1000) {
    throw new PmsLiveError("pms_data_unavailable");
  }
  const start = Date.parse(result.startAt);
  const asOf = Date.parse(result.asOf);
  const age = Date.now() - asOf;
  if (!Number.isFinite(start) || !Number.isFinite(asOf) ||
      age < -60_000 || age > 5 * 60_000 ||
      (startAt === "now"
        ? Math.abs(start - requestedAt) > 2 * 60_000
        : start !== Date.parse(startAt))) {
    throw new PmsLiveError("pms_data_unavailable");
  }
  return {
    propertyId: PMS_PROPERTY_ID,
    startAt: result.startAt,
    durationMinutes,
    asOf: result.asOf,
    availableCount: result.availableCount as number,
  };
}
