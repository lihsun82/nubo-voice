import { NextResponse } from "next/server";
import { z } from "zod";
import { generateWithFallback } from "@/lib/ai-engine";
import { addInboxItem } from "@/lib/inbox-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  question: z.string().min(3).max(5000),
  title: z.string().min(2).max(120).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "研究問題不完整" }, { status: 400 });
  }

  try {
    const prompt = [
      "你是 NUBO 的研究執行器，請以繁體中文完成研究。",
      "先確認問題，再比較可行方案、限制、成本與風險，最後提出可執行建議。",
      "涉及最新資訊時必須使用可用的網路搜尋能力，並附來源。",
      `研究問題：${parsed.data.question}`,
    ].join("\n");
    const result = await generateWithFallback(prompt, { needsCurrentSources: true });
    const title = parsed.data.title ?? "NUBO研究結果";
    const message = `${result.text}\n\n---\nAI引擎：${result.provider}（${result.model}）`;
    const notice = await addInboxItem(`research-${crypto.randomUUID()}`, title, message);
    return NextResponse.json({ ok: true, result: message, notice });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "研究工作失敗" },
      { status: 500 },
    );
  }
}
