import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "伺服器尚未設定 OPENAI_API_KEY" },
      { status: 500 },
    );
  }

  const offerSdp = await request.text();
  if (!offerSdp.startsWith("v=")) {
    return NextResponse.json(
      { error: "收到的 WebRTC SDP 格式不正確" },
      { status: 400 },
    );
  }

  const form = new FormData();
  form.set("sdp", offerSdp);
  form.set(
    "session",
    JSON.stringify({
      type: "realtime",
      model: "gpt-realtime-2",
      audio: {
        output: { voice: "marin" },
      },
    }),
  );

  try {
    const upstream = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier":
          process.env.OPENAI_SAFETY_IDENTIFIER ?? "nubo-owner",
      },
      body: form,
      cache: "no-store",
    });

    const body = await upstream.text();

    if (!upstream.ok) {
      console.error("OpenAI Realtime call failed", {
        status: upstream.status,
        body,
      });

      return new Response(body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
          "Cache-Control": "no-store",
        },
      });
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/sdp",
        "Cache-Control": "no-store",
        ...(upstream.headers.get("Location")
          ? { Location: upstream.headers.get("Location") as string }
          : {}),
      },
    });
  } catch (error) {
    console.error("Realtime proxy error", error);
    return NextResponse.json(
      { error: "無法連線至 OpenAI Realtime API" },
      { status: 502 },
    );
  }
}
