import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_REALTIME_CALL_URL = "https://api.openai.com/v1/realtime/calls";

function normalizeAuthorization(request: Request) {
  const incoming = request.headers.get("authorization")?.trim();
  if (incoming?.toLowerCase().startsWith("bearer ")) return incoming;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return apiKey ? `Bearer ${apiKey}` : "";
}

function multipartPart(
  boundary: string,
  name: string,
  contentType: string,
  value: string,
) {
  return [
    `--${boundary}\r\n`,
    `Content-Disposition: form-data; name="${name}"\r\n`,
    `Content-Type: ${contentType}\r\n\r\n`,
    value,
    "\r\n",
  ].join("");
}

export async function POST(request: Request) {
  try {
    const authorization = normalizeAuthorization(request);
    if (!authorization) {
      return NextResponse.json(
        { error: "OpenAI 語音憑證尚未設定" },
        { status: 503 },
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
        { error: "OpenAI Realtime SDP 內容缺失" },
        { status: 400 },
      );
    }

    const boundary = `nubo-realtime-${crypto.randomUUID()}`;
    let multipartBody = multipartPart(
      boundary,
      "sdp",
      "application/sdp",
      sdp,
    );
    if (session.trim()) {
      multipartBody += multipartPart(
        boundary,
        "session",
        "application/json",
        session,
      );
    }
    multipartBody += `--${boundary}--\r\n`;

    const response = await fetch(OPENAI_REALTIME_CALL_URL, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: multipartBody,
      cache: "no-store",
    });

    const answer = await response.text();
    return new Response(answer, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/sdp",
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : "NUBO 無法建立 OpenAI 即時語音連線",
      },
      { status: 502 },
    );
  }
}
