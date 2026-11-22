import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIVE_ENDPOINT = "https://api.openai.com/v1/live/sessions";
const MODEL = "gpt-live-1.1";
const MAX_SESSIONS_PER_HOUR = 10;
const timestamps: number[] = [];

const instructions = [
  "You are NUBO's private Taiwanese Hokkien (Tâi-gí / 臺灣台語) audition assistant.",
  "This is a voice pronunciation test, not a hotel reservation service.",
  "Listen to everyday Taiwanese Hokkien and speak in authentic colloquial Taiwanese Hokkien,",
  "using a natural Taiwan accent and short, idiomatic responses. Never imitate Teochew (潮州話).",
  "Avoid overly formal written Chinese or unnatural pronunciation.",
  "If unsure about a Taiwanese Hokkien pronunciation, say so instead of pretending.",
  "For hotel questions, do not claim to have checked the PMS, rooms, availability, pricing,",
  "reservations or guest data; politely say live hotel data is not connected in this test.",
  "Do not perform any tools or actions. Keep replies brief and friendly.",
].join(" ");

const noStore = { "Cache-Control": "no-store" };

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: message, code }, { status, headers: noStore });
}

function isTrustedRequest(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin") || "";
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "")
    .split(",")[0].trim().toLowerCase();
  try {
    const source = new URL(origin);
    return Boolean(host) && source.host.toLowerCase() === host
      && (source.protocol === "https:" || (source.protocol === "http:" && source.hostname === "localhost"));
  } catch {
    return false;
  }
}

function authorized(request: NextRequest) {
  const expected = process.env.NUBO_LIVE11_LAB_PIN || "";
  const provided = request.headers.get("x-nubo-live11-lab-pin") || "";
  if (expected.length < 20) return false;
  const left = Buffer.from(provided, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (process.env.NUBO_LIVE11_LAB_ENABLED !== "true") {
    return error(503, "lab_disabled", "台語試音服務尚未啟用。");
  }
  if (!isTrustedRequest(request)) return error(403, "origin_denied", "來源驗證失敗。");
  if (!authorized(request)) return error(401, "lab_pin_invalid", "測試授權碼未設定或不正確。");
  const apiKey = process.env.NUBO_GPT_LIVE_API_KEY;
  if (!apiKey) return error(503, "lab_key_missing", "獨立測試服務尚未設定 NUBO_GPT_LIVE_API_KEY。");

  const payload = await request.json().catch(() => null) as null | { action?: unknown; sdp?: unknown; sessionId?: unknown };
  if (!payload || typeof payload !== "object") return error(400, "invalid_payload", "請求內容無效。");

  if (payload.action !== "start") return error(400, "unknown_action", "不支援的操作。");
  const sdp = typeof payload.sdp === "string" ? payload.sdp : "";
  if (!sdp.startsWith("v=0") || sdp.length > 64000) {
    return error(400, "invalid_sdp", "語音連線資料格式不正確。");
  }

  const now = Date.now();
  while (timestamps.length && timestamps[0] < now - 60 * 60_000) timestamps.shift();
  if (timestamps.length >= MAX_SESSIONS_PER_HOUR) {
    return error(429, "lab_limit", "已達每小時十次的語音測試上限。");
  }
  timestamps.push(now);

  let response: Response;
  try {
    response = await fetch(LIVE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": "nubo-private-live11-taigi-lab",
      },
      body: JSON.stringify({
        session: {
          model: MODEL,
          instructions,
          audio: { output: { voice: "marin" } },
        },
        transport: { type: "webrtc", sdp },
      }),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
  } catch {
    return error(502, "live_unreachable", "Live 1.1 服務無法連線，未建立成功的測試通話。");
  }

  if (!response.ok) {
    return error(response.status >= 500 ? 502 : response.status, "live_upstream_error",
      `Live 1.1 連線遭拒（HTTP ${response.status}），請確認金鑰權限及餘額。`);
  }
  const result = await response.json().catch(() => null) as null | {
    session?: { id?: string };
    transport?: { type?: string; sdp?: string };
  };
  const answer = result?.transport?.sdp;
  const sessionId = result?.session?.id;
  if (result?.transport?.type !== "webrtc" || typeof answer !== "string"
    || !answer.startsWith("v=0") || typeof sessionId !== "string") {
    return error(502, "invalid_live_answer", "Live 1.1 回傳格式錯誤，未能完成語音連線。");
  }
  return NextResponse.json({ model: MODEL, sessionId, sdp: answer }, { headers: noStore });
}
