import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_REALTIME_CALL_URL = "https://api.openai.com/v1/realtime/calls";
// The legacy Realtime model is scheduled for retirement in January 2027.
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1-mini";
const REALTIME_MODEL_ALLOWLIST = new Set([
  "gpt-realtime-2.1-mini",
  "gpt-realtime-2.1",
]);

function getRealtimeModel() {
  const model = process.env.NUBO_OPENAI_REALTIME_MODEL?.trim() || DEFAULT_REALTIME_MODEL;
  return REALTIME_MODEL_ALLOWLIST.has(model) ? model : DEFAULT_REALTIME_MODEL;
}

/**
 * Paid NUBO voice access is owner-only. Never mint Realtime client tokens
 * for unauthenticated visitors on the public nubo.ainubo.com website.
 * Configure a private high-entropy (20+ characters) owner access code on
 * Railway, and enter it once per browser session in the OpenAI voice screen.
 */
function authorizeOwner(request: NextRequest): NextResponse | null {
  const expected = process.env.NUBO_OPENAI_VOICE_ACCESS_CODE?.trim() || "";
  if (expected.length < 20) {
    return NextResponse.json(
      { error: "OpenAI 語音安全鎖尚未設定：請在 Railway 設定至少20字元的 NUBO_OPENAI_VOICE_ACCESS_CODE。", code: "voice_access_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const provided = request.headers.get("x-nubo-voice-access")?.trim() || "";
  const lhs = Buffer.from(provided, "utf8");
  const rhs = Buffer.from(expected, "utf8");
  if (lhs.length !== rhs.length || !timingSafeEqual(lhs, rhs)) {
    return NextResponse.json(
      { error: "OpenAI 語音授權碼不正確，請重新輸入。", code: "voice_access_denied" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}
const DEFAULT_OPENAI_VOICE = "shimmer";
const DEFAULT_SPEECH_SPEED = 1;
const LEO_REALTIME_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

type UnknownRecord = Record<string, unknown>;
type RealtimeVoice = string | { id: string };

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseSessionSource(rawSession: string) {
  try {
    return asRecord(JSON.parse(rawSession)) ?? {};
  } catch {
    return {};
  }
}

function parseAudioOutput(source: UnknownRecord) {
  const audio = asRecord(source.audio);
  return asRecord(audio?.output) ?? {};
}

function parseRequestedVoice(source: UnknownRecord) {
  const voice = parseAudioOutput(source).voice;
  return typeof voice === "string" && LEO_REALTIME_VOICES.has(voice)
    ? voice
    : DEFAULT_OPENAI_VOICE;
}

function parseRequestedSpeed(source: UnknownRecord) {
  const speed = Number(parseAudioOutput(source).speed ?? DEFAULT_SPEECH_SPEED);
  return clamp(Number.isFinite(speed) ? speed : DEFAULT_SPEECH_SPEED, 0.85, 1.15);
}

function getLeoRealtimeVoice(source: UnknownRecord): RealtimeVoice {
  const customVoiceId = process.env.NUBO_OPENAI_CUSTOM_VOICE_ID?.trim();
  return customVoiceId ? { id: customVoiceId } : parseRequestedVoice(source);
}

function buildRealtimeSession(rawSession: string) {
  const source = parseSessionSource(rawSession);
  const session: UnknownRecord = {
    type: "realtime",
    model: getRealtimeModel(),
    output_modalities: ["audio"],
    audio: {
      output: {
        voice: getLeoRealtimeVoice(source),
        speed: parseRequestedSpeed(source),
      },
    },
  };

  if (typeof source.instructions === "string" && source.instructions.trim()) {
    session.instructions = source.instructions.trim();
  }

  return JSON.stringify(session);
}

function buildMultipartBody(boundary: string, sdp: string, session: string) {
  return [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="sdp"\r\n',
    "Content-Type: application/sdp\r\n\r\n",
    sdp,
    "\r\n",
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="session"\r\n',
    "Content-Type: application/json\r\n\r\n",
    session,
    "\r\n",
    `--${boundary}--\r\n`,
  ].join("");
}

function serviceError(status: number, fallback: string, payload?: unknown) {
  const record = asRecord(payload);
  const error = asRecord(record?.error);
  const upstreamMessage = typeof error?.message === "string" ? error.message : "";
  const keyProblem = status === 401 || status === 403;

  return NextResponse.json(
    {
      error: keyProblem
        ? "OpenAI API Key 無效、沒有 Realtime 權限，或自訂聲線尚未授權"
        : upstreamMessage || fallback,
      code: `realtime_${status}`,
    },
    { status },
  );
}

export async function GET(request: NextRequest) {
  const unauthorized = authorizeOwner(request);
  if (unauthorized) return unauthorized;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "高擬人語音服務尚未設定憑證", code: "missing_api_key" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const source: UnknownRecord = {
    audio: {
      output: {
        voice: url.searchParams.get("voice") ?? DEFAULT_OPENAI_VOICE,
        speed: Number(url.searchParams.get("speed") ?? DEFAULT_SPEECH_SPEED),
      },
    },
  };

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier":
        process.env.OPENAI_SAFETY_IDENTIFIER ?? "nubo-owner",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: getRealtimeModel(),
        output_modalities: ["audio"],
        audio: {
          output: {
            voice: getLeoRealtimeVoice(source),
            speed: parseRequestedSpeed(source),
          },
        },
      },
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return serviceError(response.status, "高擬人即時語音憑證建立失敗", data);

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = authorizeOwner(request);
    if (unauthorized) return unauthorized;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "高擬人語音服務尚未設定憑證", code: "missing_api_key" },
        { status: 500 },
      );
    }

    const incomingForm = await request.formData();
    const sdpValue = incomingForm.get("sdp");
    const sessionValue = incomingForm.get("session");
    const sdp =
      typeof sdpValue === "string"
        ? sdpValue
        : sdpValue instanceof Blob
          ? await sdpValue.text()
          : "";
    const rawSession =
      typeof sessionValue === "string"
        ? sessionValue
        : sessionValue instanceof Blob
          ? await sessionValue.text()
          : "";

    if (!sdp.trim()) {
      return NextResponse.json(
        { error: "OpenAI Realtime SDP 內容缺失", code: "missing_sdp" },
        { status: 400 },
      );
    }

    const safeSession = buildRealtimeSession(rawSession);
    const boundary = `nubo-realtime-${crypto.randomUUID()}`;
    const response = await fetch(OPENAI_REALTIME_CALL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "OpenAI-Safety-Identifier":
          process.env.OPENAI_SAFETY_IDENTIFIER ?? "nubo-owner",
      },
      body: buildMultipartBody(boundary, sdp, safeSession),
      cache: "no-store",
    });

    const answer = await response.text();
    if (!response.ok) {
      let payload: unknown = {};
      try {
        payload = JSON.parse(answer);
      } catch {
        payload = {};
      }
      console.error("NUBO realtime call error", response.status, answer.slice(0, 1200));
      return serviceError(response.status, "高擬人即時語音連線建立失敗", payload);
    }

    if (!/^v=0/m.test(answer)) {
      return NextResponse.json(
        { error: "OpenAI 回傳的語音連線資料格式不正確", code: "invalid_sdp_answer" },
        { status: 502 },
      );
    }

    return new Response(answer, {
      status: 200,
      headers: {
        "Content-Type": "application/sdp",
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    console.error("NUBO realtime proxy failure", cause);
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? `NUBO Realtime 代理失敗：${cause.message}`
            : "NUBO 無法建立高擬人即時語音連線",
        code: "realtime_proxy_failure",
      },
      { status: 502 },
    );
  }
}
