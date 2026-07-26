import { NextResponse } from "next/server";
import { isOmniRouteEnabled, omniRouteChat } from "@/lib/omniroute-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isOmniRouteEnabled()) {
    return NextResponse.json(
      { error: "OmniRoute 尚未啟用，請設定 NUBO_OMNIROUTE_ENABLED=1 與雲端 OMNIROUTE_BASE_URL。" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "缺少問題內容" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "問題內容過長" }, { status: 400 });

  try {
    const result = await omniRouteChat({
      messages: [
        {
          role: "system",
          content: "你是 NUBO。請使用自然、簡潔的繁體中文回答。若資訊不足要明確說明，不得捏造已執行的外部操作。",
        },
        { role: "user", content: text },
      ],
      temperature: 0.2,
      timeoutMs: 20_000,
    });
    return NextResponse.json({ ok: true, text: result.text, model: result.model ?? "auto" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OmniRoute 回覆失敗" },
      { status: 502 },
    );
  }
}
