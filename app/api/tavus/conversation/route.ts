import { NextResponse } from "next/server";

const TAVUS_API_BASE = "https://tavusapi.com/v2";

type TavusConversationResponse = {
  conversation_id?: string;
  conversation_url?: string;
  meeting_token?: string;
  status?: string;
  error?: string;
  message?: string;
};

function getConfig() {
  return {
    apiKey: process.env.TAVUS_API_KEY?.trim() ?? "",
    replicaId: process.env.TAVUS_REPLICA_ID?.trim() ?? "",
    personaId: process.env.TAVUS_PERSONA_ID?.trim() ?? "",
  };
}

export async function POST() {
  const { apiKey, replicaId, personaId } = getConfig();

  if (!apiKey || !replicaId || !personaId) {
    return NextResponse.json(
      {
        error:
          "Tavus 尚未完成設定。請在 Railway 設定 TAVUS_API_KEY、TAVUS_REPLICA_ID、TAVUS_PERSONA_ID。",
      },
      { status: 503 },
    );
  }

  const response = await fetch(`${TAVUS_API_BASE}/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      replica_id: replicaId,
      persona_id: personaId,
      conversation_name: "NUBO 真人智慧禮賓",
      require_auth: false,
      max_participants: 2,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as TavusConversationResponse;

  if (!response.ok || !payload.conversation_id || !payload.conversation_url) {
    return NextResponse.json(
      {
        error:
          payload.error ||
          payload.message ||
          "真人 NUBO 對話建立失敗，請檢查 Tavus 設定與額度。",
      },
      { status: response.status || 502 },
    );
  }

  return NextResponse.json({
    conversationId: payload.conversation_id,
    conversationUrl: payload.conversation_url,
    meetingToken: payload.meeting_token ?? "",
    status: payload.status ?? "active",
  });
}

export async function DELETE(request: Request) {
  const { apiKey } = getConfig();
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId")?.trim() ?? "";

  if (!apiKey) {
    return NextResponse.json({ error: "Tavus API Key 尚未設定。" }, { status: 503 });
  }

  if (!conversationId) {
    return NextResponse.json({ error: "缺少 conversationId。" }, { status: 400 });
  }

  const response = await fetch(
    `${TAVUS_API_BASE}/conversations/${encodeURIComponent(conversationId)}/end`,
    {
      method: "POST",
      headers: { "x-api-key": apiKey },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as TavusConversationResponse;
    return NextResponse.json(
      {
        error:
          payload.error || payload.message || "真人 NUBO 對話結束失敗。",
      },
      { status: response.status },
    );
  }

  return NextResponse.json({ ok: true });
}
