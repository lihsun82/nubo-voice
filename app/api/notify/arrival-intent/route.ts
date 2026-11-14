import { NextRequest, NextResponse } from "next/server";
import { classifyNuboArrivalIntent, isNuboArrivalCancellation, type NuboArrivalIntent } from "@/lib/nubo-arrival-intent";
import { pushHotelLineText } from "@/lib/nubo-hotel-line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOLDOWN_MS = 5 * 60_000;
const LEGACY_COOLDOWN_MS = 8_000;
const SOURCE_WINDOW_MS = 10 * 60_000;
const SOURCE_MAX_ALERTS = 12;
const recent = new Map<string, number>();
type LineDelivery = Awaited<ReturnType<typeof pushHotelLineText>>;
const inFlight = new Map<string, Promise<LineDelivery>>();
const sourceWindows = new Map<string, { startedAt: number; count: number }>();

function taipeiTime() {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function isAllowedOrigin(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const source = new URL(origin);
    // Railway/Next may rewrite nextUrl.host to an internal deployment host.
    // Match the browser-facing host used by the existing proxy, and include
    // the public guest PWA domain even when that forwarding header is absent.
    const publicHosts = [
      request.headers.get("x-forwarded-host")?.split(",")[0]?.trim(),
      request.headers.get("host")?.split(",")[0]?.trim(),
      request.nextUrl.host,
    ].filter((host): host is string => Boolean(host));
    return source.origin === "https://nubo.ainubo.com" ||
      (source.protocol === "https:" || source.hostname === "localhost" || source.hostname === "127.0.0.1") &&
      publicHosts.some((host) => host.toLowerCase() === source.host.toLowerCase());
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    console.warn("[arrival-alert] rejected cross-origin request");
    return NextResponse.json({ ok: false, sent: false, error: "invalid_origin" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const transcript = String(body.transcript ?? "").trim().slice(0, 500);
  const source = body.source === "model" ? "model" : "transcript";
  const modelIntent: NuboArrivalIntent | null =
    body.intent === "checkin" || body.intent === "booking" || body.intent === "lodging" ? body.intent : null;
  const deviceId = /^[\w-]{8,80}$/.test(String(body.deviceId ?? ""))
    ? String(body.deviceId)
    : "unidentified";
  const utteranceId = /^[\w-]{8,80}$/.test(String(body.utteranceId ?? ""))
    ? String(body.utteranceId)
    : "";
  if (!transcript || isNuboArrivalCancellation(transcript)) {
    return NextResponse.json({ ok: true, sent: false, reason: "no_arrival_request" });
  }

  // Common languages are verified deterministically. The live model can
  // identify an equivalent request in any other language through its tool call.
  const intent = classifyNuboArrivalIntent(transcript) ??
    (source === "model" ? modelIntent : null);
  if (!intent) {
    return NextResponse.json({ ok: true, sent: false, reason: "no_arrival_request" });
  }

  // A new spoken request gets a new ID, even when it has the same intent.
  // Older cached PWA clients use a short fallback window until refreshed.
  const key = utteranceId ? `${deviceId}:${utteranceId}` : `${deviceId}:${intent}`;
  const cooldownMs = utteranceId ? COOLDOWN_MS : LEGACY_COOLDOWN_MS;
  const now = Date.now();
  for (const [oldKey, at] of recent) {
    if (now - at > COOLDOWN_MS * 2) recent.delete(oldKey);
  }
  if (now - (recent.get(key) ?? 0) < cooldownMs) {
    console.info("[arrival-alert] duplicate utterance suppressed", { intent, source });
    return NextResponse.json({ ok: true, sent: false, duplicate: true, intent });
  }

  const sourceId = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const bucket = sourceWindows.get(sourceId);
  if (bucket && now - bucket.startedAt < SOURCE_WINDOW_MS && bucket.count >= SOURCE_MAX_ALERTS) {
    return NextResponse.json({ ok: false, sent: false, error: "通知頻率過高" }, { status: 429 });
  }

  sourceWindows.set(sourceId, bucket && now - bucket.startedAt < SOURCE_WINDOW_MS
    ? { startedAt: bucket.startedAt, count: bucket.count + 1 }
    : { startedAt: now, count: 1 });
  const label = intent === "checkin" ? "辦理入住" : intent === "booking" ? "訂房" : "住宿需求";
  const message = [
    "🛎️ NUBO 旅客到店需求",
    `時間：${taipeiTime()}（台灣時間）`,
    `類型：${label}`,
    "來源：NUBO 平板語音",
    "請現場人員主動協助旅客。",
  ].join("\n");

  const active = inFlight.get(key);
  if (active) {
    try {
      await active;
      console.info("[arrival-alert] concurrent utterance suppressed", { intent, source });
      return NextResponse.json({ ok: true, sent: false, duplicate: true, intent });
    } catch {
      // A concurrent delivery failed; this request may retry it.
    }
  }

  const delivery = pushHotelLineText(message);
  inFlight.set(key, delivery);
  try {
    const result = await delivery;
    recent.set(key, Date.now());
    console.info("[arrival-alert] delivered", {
      intent, via: result.via, succeeded: result.succeeded,
    });
    return NextResponse.json({
      ok: true, sent: true, intent,
      channel: "line", targetCount: result.succeeded,
    });
  } catch (error) {
    const relayStatus = error instanceof Error
      ? error.message.match(/Relay 發送失敗：(\d{3})/)?.[1] ?? null
      : null;
    console.warn("[arrival-alert] delivery failed", {
      intent, relayStatus, errorName: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { ok: false, sent: false, error: "LINE 群組通知未送達" },
      { status: 502 },
    );
  } finally {
    if (inFlight.get(key) === delivery) inFlight.delete(key);
  }
}
