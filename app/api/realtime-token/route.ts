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

export async function GET(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "高擬人語音服務尚未設定憑證" },
      { status: 500 },
    );
  }

  const requestedVoice = new URL(request.url).searchParams.get("voice") ?? "marin";
  const voice = OPENAI_VOICES.has(requestedVoice) ? requestedVoice : "marin";
  const model = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime";

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
        model,
        output_modalities: ["audio"],
        audio: {
          output: { voice },
        },
      },
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("NUBO realtime token error", response.status, data);
    return NextResponse.json(
      { error: "高擬人即時語音憑證建立失敗", code: `token_${response.status}` },
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
    const session =
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

    const form = new FormData();
    form.append(
      "sdp",
      new Blob([sdp], { type: "application/sdp" }),
      "offer.sdp",
    );

    if (session.trim()) {
      let normalizedSession = session;
      try {
        normalizedSession = JSON.stringify(JSON.parse(session));
      } catch {
        return NextResponse.json(
          { error: "OpenAI Realtime session 格式不正確", code: "invalid_session_json" },
          { status: 400 },
        );
      }

      form.append(
        "session",
        new Blob([normalizedSession], { type: "application/json" }),
        "session.json",
      );
    }

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
      console.error(
        "NUBO realtime call error",
        response.status,
        answer.slice(0, 1000),
      );
      return NextResponse.json(
        {
          error: "高擬人即時語音連線建立失敗",
          code: `realtime_call_${response.status}`,
        },
        { status: response.status },
      );
    }

    if (!answer.trim().startsWith("v=0")) {
      console.error("NUBO realtime invalid SDP answer", answer.slice(0, 500));
      return NextResponse.json(
        { error: "OpenAI 回傳的語音連線格式不正確", code: "invalid_sdp_answer" },
        { status: 502 },
      );
    }

    return new Response(answer, {
      status: 201,
      headers: {
        "Content-Type": "application/sdp",
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    console.error("NUBO realtime proxy failure", cause);
    return NextResponse.json(
      { error: "NUBO 無法建立高擬人即時語音連線", code: "proxy_failure" },
      { status: 502 },
    );
  }
}
