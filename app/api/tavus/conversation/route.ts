import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAVUS_API_BASE = "https://tavusapi.com/v2";

type TavusListResponse<T> = {
  data?: T[];
};

type Persona = {
  persona_id?: string;
  persona_name?: string;
  name?: string;
};

type Replica = {
  replica_id?: string;
  replica_name?: string;
  name?: string;
  status?: string;
};

type ConversationResponse = {
  conversation_id?: string;
  conversation_url?: string;
  meeting_token?: string;
  status?: string;
  [key: string]: unknown;
};

async function tavusRequest(path: string, apiKey: string, init?: RequestInit) {
  const response = await fetch(`${TAVUS_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Tavus ${path} failed (${response.status}): ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function resolvePersonaId(apiKey: string) {
  if (process.env.TAVUS_PERSONA_ID) return process.env.TAVUS_PERSONA_ID;

  const result = (await tavusRequest(
    "/personas?limit=100&page=1",
    apiKey
  )) as TavusListResponse<Persona>;

  const personas = result.data ?? [];
  const preferred = personas.find((item) => {
    const label = `${item.persona_name ?? ""} ${item.name ?? ""}`.toLowerCase();
    return label.includes("nubo");
  });

  return preferred?.persona_id ?? personas[0]?.persona_id ?? null;
}

async function resolveReplicaId(apiKey: string) {
  if (process.env.TAVUS_REPLICA_ID) return process.env.TAVUS_REPLICA_ID;

  const result = (await tavusRequest(
    "/replicas?limit=100&page=1",
    apiKey
  )) as TavusListResponse<Replica>;

  const replicas = result.data ?? [];
  const preferred = replicas.find((item) => {
    const label = `${item.replica_name ?? ""} ${item.name ?? ""}`.toLowerCase();
    return label.includes("nubo") && item.status !== "error";
  });

  const usable = replicas.find((item) => item.status !== "error");
  return preferred?.replica_id ?? usable?.replica_id ?? replicas[0]?.replica_id ?? null;
}

export async function POST() {
  const apiKey = process.env.TAVUS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "缺少 TAVUS_API_KEY" },
      { status: 500 }
    );
  }

  try {
    const [personaId, replicaId] = await Promise.all([
      resolvePersonaId(apiKey),
      resolveReplicaId(apiKey),
    ]);

    if (!personaId || !replicaId) {
      return NextResponse.json(
        {
          success: false,
          error: "Tavus 帳號中找不到可用的 Persona 或 Replica",
          nextStep: "請先在 Tavus Developer Portal 建立 Persona 與 Replica。",
        },
        { status: 409 }
      );
    }

    const data = (await tavusRequest("/conversations", apiKey, {
      method: "POST",
      body: JSON.stringify({
        persona_id: personaId,
        replica_id: replicaId,
        conversation_name: `NUBO-${Date.now()}`,
      }),
    })) as ConversationResponse;

    if (!data.conversation_id || !data.conversation_url) {
      return NextResponse.json(
        {
          success: false,
          error: "Tavus 回傳資料不完整",
          details: data,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      personaId,
      replicaId,
      conversationId: data.conversation_id,
      conversationUrl: data.conversation_url,
      meetingToken: data.meeting_token ?? null,
      status: data.status ?? "active",
    });
  } catch (error) {
    console.error("Create Tavus conversation error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "建立真人 NUBO 通話時發生錯誤",
      },
      { status: 502 }
    );
  }
}
