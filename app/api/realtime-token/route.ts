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
const DEFAULT_FEMALE_VOICE = "coral";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function normalizeVoice(value: unknown) {
  if (value === "marin") return DEFAULT_FEMALE_VOICE;
  return typeof value === "string" && OPENAI_VOICES.has(value)
    ? value
    : DEFAULT_FEMALE_VOICE;
}

function sanitizeRealtimeSession(raw: string) {
  let source: UnknownRecord = {};
  try {
    source = asRecord(JSON.parse(raw)) ?? {};
  } catch {
    source = {};
  }

  const audio = asRecord(source.audio);
  const audioInput = asRecord(audio?.input);
  const audioOutput = asRecord(audio?.output);
  const turnDetection = asRecord(audioInput?.turn_detection);

  const session: UnknownRecord = {
    type: "realtime",
    model: DEFAULT_REALTIME_MODEL,
    output_modalities: ["audio"],
    audio: {
      input: {
        turn_detection: turnDetection?.type === "semantic_vad"
          ? {
              type: "semantic_vad",
              create_response: turnDetection.create_response !== false,
              interrupt_response: turnDetection.interrupt_response !== false,
              eagerness:
                turnDetection.eagerness === "low" ||
                turnDetection.eagerness === "high" ||
                turnDetection.eagerness === "medium"
                  ? turnDetection.eagerness
                  : "auto",
            }
          : {
              type: "server_vad",
              create_response: true,
              interrupt_response: true,
            },
      },
      output: {
        voice: normalizeVoice(audioOutput?.voice),
        speed:
          typeof audioOutput?.speed === "number" &&
          audioOutput.speed >= 0.25 &&
          audioOutput.speed <= 1.5
            ? audioOutput.speed
            : 0.92,
      },
    },
  };

  if (typeof source.instructions === "string" && source.instructions.trim()) {
    session.instructions = source.instructions.trim();
  }

  if (Array.isArray(source.tools)) {
    session.tools = source.tools;
    session.tool_choice = source.tool_choice === "none" ? "none" : "auto";
  }

  return JSON.stringify(session);
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "高擬人語音服務尚未設定憑證" },
      { status: 500 },
    );
  }

  const requestedVoice =
    new URL(request.url).searchParams.get("voice") ?? DEFAULT_FEMALE_VOICE;
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
          output: { voice, speed: 0.92 },
        },
      },
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("NUBO realtime token error", data);
    return NextResponse.json(
      { error: "高擬人即時語音憑證建立失敗" },
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
        { error: "高擬人語音服務尚未設定憑證" },
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
        { error: "OpenAI Realtime SDP 內容缺失" },
        { status: 400 },
      );
    }

    const safeSession = sanitizeRealtimeSession(rawSession);
    const form = new FormData();
    form.append(
      "sdp",
      new Blob([sdp], { type: "application/sdp" }),
      "offer.sdp",
    );
    form.append(
      "session",
      new Blob([safeSession], { type: "application/json" }),
      "session.json",
    );

    const response = await fetch(OPENAI_REALTIME_CALL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier":
          process.env.OPENAI_SAFETY_IDENTIFIER ?? "nubo-owner",
      },
      body: form,
      cache: "no-store",
    });

    const answer = await response.text();
    if (!response.ok) {
      let upstreamMessage = "";
      try {
        const payload = JSON.parse(answer) as {
          error?: { code?: unknown; param?: unknown; message?: unknown };
        };
        const code =
          typeof payload.error?.code === "string" ? payload.error.code : "";
        const param =
          typeof payload.error?.param === "string" ? payload.error.param : "";
        upstreamMessage = [code, param].filter(Boolean).join(":");
      } catch {
        upstreamMessage = "";
      }

      console.error(
        "NUBO realtime call error",
        response.status,
        answer.slice(0, 1000),
      );
      return NextResponse.json(
        {
          error: upstreamMessage
            ? `高擬人即時語音設定不相容（${upstreamMessage}）`
            : "高擬人即時語音連線建立失敗",
          code: `realtime_call_${response.status}`,
        },
        { status: response.status },
      );
    }

    if (!/^v=0/m.test(answer)) {
      console.error("NUBO realtime invalid SDP answer", answer.slice(0, 500));
      return NextResponse.json(
        { error: "OpenAI 回傳的語音連線資料格式不正確" },
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
      { error: "NUBO 無法建立高擬人即時語音連線" },
      { status: 502 },
    );
  }
}
