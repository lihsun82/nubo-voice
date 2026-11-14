import { NextRequest, NextResponse } from "next/server";
import { classifyNuboArrivalIntent, isNuboArrivalCancellation, type NuboArrivalIntent } from "@/lib/nubo-arrival-intent";
import { pushHotelLineText } from "@/lib/nubo-hotel-line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOLDOWN_MS = 45_000;
const SOURCE_WINDOW_MS = 10 * 60_000;
const SOURCE_MAX_ALERTS = 12;
const recent = new Map<string, number>();
const sourceWindows = new Map<string, { startedAt: number; count: number }>();

function taipeiTime() {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(new Date());
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.nextUrl.host) {
        return NextResponse.json({ ok: false, sent: false }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ ok: false, sent: false }, { status: 403 });
    }
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ ok: false, sent: false }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const transcript = String(body.transcript ?? "").trim().slice(0, 500);
  const source = body.source === "model" ? "model" : "transcript";
  const modelIntent: NuboArrivalIntent | null =
    body.intent === "checkin" || body.intent === "booking" ? body.intent : null;
  const deviceId = /^[\w-]{8,80}$/.test(String(body.deviceId ?? ""))
    ? String(body.deviceId)
    : "unidentified";
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

  const key = `${deviceId}:${intent}`;
  const now = Date.now();
  for (const [oldKey, at] of recent) {
    if (now - at > COOLDOWN_MS * 2) recent.delete(oldKey);
  }
  if (now - (recent.get(key) ?? 0) < COOLDOWN_MS) {
    return NextResponse.json({ ok: true, sent: false, duplicate: true, intent });
  }

  const sourceId = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const bucket = sourceWindows.get(sourceId);
  if (bucket && now - bucket.startedAt < SOURCE_WINDOW_MS && bucket.count >= SOURCE_MAX_ALERTS) {
    return NextResponse.json({ ok: false, sent: false, error: "通知頻率過高" }, { status: 429 });
  }

  recent.set(key, now);
  sourceWindows.set(sourceId, bucket && now - bucket.startedAt < SOURCE_WINDOW_MS
    ? { startedAt: bucket.startedAt, count: bucket.count + 1 }
    : { startedAt: now, count: 1 });
  const label = intent === "checkin" ? "辦理入住" : "訂房";
  const message = [
    "🛎️ NUBO 旅客到店需求",
    `時間：${taipeiTime()}（台灣時間）`,
    `類型：${label}`,
    "來源：NUBO 平板語音",
    "請現場人員主動協助旅客。",
  ].join("\n");

  try {
    const result = await pushHotelLineText(message);
    return NextResponse.json({
      ok: true, sent: true, intent,
      channel: "line", targetCount: result.succeeded,
    });
  } catch {
    recent.delete(key);
    return NextResponse.json(
      { ok: false, sent: false, error: "LINE 群組通知未送達" },
      { status: 502 },
    );
  }
}
