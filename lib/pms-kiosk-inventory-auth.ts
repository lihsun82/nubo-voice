import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * NUBO hotel-owned voice kiosks need guest-visible inventory without requiring
 * the customer to sign in. This is an intentionally PUBLIC, read-only query of
 * SELLABLE ROOM-TYPE COUNTS ONLY. It must never be used on reservation, admin,
 * room-status or write APIs.
 *
 * Browser Origin / Fetch Metadata are a browser-CSRF defense, NOT a secret or
 * proof of kiosk identity: an external server can spoof HTTP headers.
 */
const PUBLIC_INVENTORY_PATHS = new Set([
  "/api/pms/v1/availability",
  "/api/pms/v1/rest-availability",
]);
const INVENTORY_VIEW = "application/vnd.nubosci.room-types.v1+json";
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const windows = new Map<string, { start: number; count: number }>();

function originForKiosk() {
  try {
    const url = new URL(process.env.NUBO_PUBLIC_URL || "https://nubo.ainubo.com");
    return url.protocol === "https:" ? url.origin : "https://nubo.ainubo.com";
  } catch {
    return "https://nubo.ainubo.com";
  }
}

export function isHotelKioskInventoryRequest(request: NextRequest) {
  const url = new URL(request.url);
  if (!PUBLIC_INVENTORY_PATHS.has(url.pathname) || url.search || request.method !== "POST") return false;
  if (request.headers.has("authorization")) return false;
  if (request.headers.get("accept") !== INVENTORY_VIEW) return false;
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) return false;

  // Permit actual same-origin NUBO browser / Android WebView requests only.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = request.headers.get("origin");
  const publicOrigin = originForKiosk();
  if (origin) return origin === publicOrigin;

  // Some Android WebViews omit Origin on same-origin POSTs. In that case
  // require BOTH same-origin Fetch Metadata and a matching Referer.
  if (site !== "same-origin") return false;
  try {
    return new URL(request.headers.get("referer") || "").origin === publicOrigin;
  } catch {
    return false;
  }
}

/**
 * Simple per-source throttle to protect the upstream PMS from opportunistic
 * scraping and guest-app loops. Railway runs a single replica today; for
 * multiple replicas, replace this with a shared edge/Redis limiter.
 */
export function consumeHotelKioskInventoryBudget(request: NextRequest, now = Date.now()) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = forwarded && forwarded.length <= 64 ? forwarded : "unknown";
  const key = createHash("sha256").update(source).digest("hex");
  const previous = windows.get(key);
  const record = previous && now - previous.start < RATE_WINDOW_MS
    ? { start: previous.start, count: previous.count + 1 }
    : { start: now, count: 1 };
  windows.set(key, record);
  if (windows.size > 2000) {
    for (const [ip, entry] of windows) {
      if (now - entry.start >= RATE_WINDOW_MS) windows.delete(ip);
    }
  }
  return record.count <= RATE_LIMIT;
}
