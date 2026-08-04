import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_VOICES = new Set([
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

const OPENAI_REALTIME_CALL_URL = "https://api.openai.com/v1/realtime/calls";
const DEFAULT_REALTIME_MODEL = "gpt-realtime";
const DEFAULT_OPENAI_VOICE = "coral";
const LEO_LLM_SPEECH_SPEED = 0.86;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function normalizeVoice(value: unknown) {
  if (value === "marin") return DEFAULT_OPENAI_VOICE;
  return typeof value === "string" && OPENAI_VOICES.has(value)
    ? value
    : DEFAULT_OPENAI_VOICE;
}

function parseSessionSource(rawSession: string) {
  try {
    return asRecord(JSON.parse(rawSession)) ?? {};
  } catch {
    return {};
  }
}

function parseRequestedVoice(source: UnknownRecord) {
  const audio = asRecord(source.audio);
  const output = asRecord(audio?.output);
  return normalizeVoice(output?.voice);
}

function buildRealtimeSession(rawSession: string) {
  const source = parseSessionSource(rawSession);
  const session: UnknownRecord = {
    type: "realtime",
    model: DEFAULT_REALTIME_MODEL,
    output_modalities: ["audio"],
    audio: {
      output: {
        voice: parseRequestedVoice(source),
        speed: LEO_LLM_SPEECH_SPEED,
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

export async function GET(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "高擬人語音服務尚未設定憑證", code: "missing_api_key" },
      { status: 500 },
    );
  }

  const requestedVoice =
    new URL(request.url).searchParams.get("voice") ?? DEFAULT_OPENAI_VOICE;
  const voice = normalizeVoice(requestedVoice);

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
        model: DEFAULT_REALTIME_MODEL,
        output_modalities: ["audio"],
        audio: {
          output: {
            voice,
            speed: LEO_LLM_SPEECH_SPEED,
          },
        },
      },
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("NUBO realtime token error", response.status, data);
    return NextResponse.json(
      {
        error:
          response.status === 401 || response.status === 403
            ? "OpenAI API Key 無效或沒有 Realtime 權限"
            : "高擬人即時語音憑證建立失敗",
        code: `realtime_token_${response.status}`,
      },
      { status: response.status },
    );
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  try {
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
    const multipartBody = buildMultipartBody(boundary, sdp, safeSession);

    const response = await fetch(OPENAI_REALTIME_CALL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "OpenAI-Safety-Identifier":
          process.env.OPENAI_SAFETY_IDENTIFIER ?? "nubo-owner",
      },
      body: multipartBody,
      cache: "no-store",
    });

    const answer = await response.text();
    if (!response.ok) {
      let upstreamCode = "";
      let upstreamParam = "";
      let upstreamMessage = "";

      try {
        const payload = JSON.parse(answer) as {
          error?: { code?: unknown; param?: unknown; message?: unknown };
        };
        upstreamCode =
          typeof payload.error?.code === "string" ? payload.error.code : "";
        upstreamParam =
          typeof payload.error?.param === "string" ? payload.error.param : "";
        upstreamMessage =
          typeof payload.error?.message === "string" ? payload.error.message : "";
      } catch {
        // Non-JSON upstream body is logged below.
      }

      console.error("NUBO realtime call error", {
        status: response.status,
        code: upstreamCode,
        param: upstreamParam,
        message: upstreamMessage,
        body: answer.slice(0, 1200),
      });

      const isKeyProblem = response.status === 401 || response.status === 403;
      return NextResponse.json(
        {
          error: isKeyProblem
            ? "OpenAI API Key 無效或沒有 Realtime 權限"
            : upstreamMessage
              ? `OpenAI Realtime：${upstreamMessage}`
              : "高擬人即時語音連線建立失敗",
          code: `realtime_call_${response.status}`,
          upstreamCode,
          upstreamParam,
        },
        { status: response.status },
      );
    }

    if (!/^v=0/m.test(answer)) {
      console.error("NUBO realtime invalid SDP answer", answer.slice(0, 500));
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
