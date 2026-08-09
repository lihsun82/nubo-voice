import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  question: z.string().trim().min(2).max(1200),
});

function isTyphoonQuestion(question: string) {
  return /(颱風|台風|熱帶性低氣壓|熱帶低壓|颱風警報|海上警報|陸上警報)/i.test(
    question,
  );
}

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item?.content)) continue;
    for (const part of item.content) {
      if (part?.type === "output_text" && typeof part?.text === "string") {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function extractSources(payload: any) {
  const urls = new Set<string>();
  const output = Array.isArray(payload?.output) ? payload.output : [];

  for (const item of output) {
    const sources = item?.action?.sources;
    if (!Array.isArray(sources)) continue;
    for (const source of sources) {
      if (typeof source?.url === "string" && source.url) urls.add(source.url);
    }
  }

  return [...urls].slice(0, 5);
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "即時查詢問題不完整" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "即時搜尋服務尚未設定" },
      { status: 503 },
    );
  }

  const question = parsed.data.question;
  const typhoon = isTyphoonQuestion(question);
  const now = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

  const webTool = typhoon
    ? {
        type: "web_search",
        search_context_size: "low",
        filters: {
          allowed_domains: ["cwa.gov.tw", "opendata.cwa.gov.tw"],
        },
        user_location: {
          type: "approximate",
          country: "TW",
          timezone: "Asia/Taipei",
        },
      }
    : {
        type: "web_search",
        search_context_size: "low",
        user_location: {
          type: "approximate",
          country: "TW",
          timezone: "Asia/Taipei",
        },
      };

  const prompt = typhoon
    ? [
        `現在台灣時間：${now}。`,
        "你是 NUBO 的即時颱風查詢器。必須先搜尋網路，不可用模型記憶猜測。",
        "只採用中央氣象署（CWA）最新資料。",
        "直接回答台灣目前是否有颱風、熱帶性低氣壓、海上或陸上颱風警報；若有，說名稱、位置/動向及是否影響台灣。",
        "如果中央氣象署目前沒有發布颱風消息或警報，要明確說目前沒有，不要含糊。",
        "回答控制在 3 到 6 句，適合語音直接播報。",
        `使用者問題：${question}`,
      ].join("\n")
    : [
        `現在台灣時間：${now}。`,
        "你是 NUBO 的快速即時資訊查詢器。必須先搜尋網路，不可用模型記憶猜測最近消息。",
        "優先使用官方來源與可信新聞來源，先給明確答案，再補最重要的時間與背景。",
        "回答控制在 3 到 7 句，適合語音直接播報。",
        `使用者問題：${question}`,
      ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7500);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.NUBO_CURRENT_INFO_MODEL || "gpt-5-mini",
        input: prompt,
        tools: [webTool],
        tool_choice: "required",
        store: false,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `即時搜尋錯誤：${response.status}`);
    }

    const result = extractOutputText(payload);
    if (!result) throw new Error("即時搜尋沒有回傳可用答案");

    return NextResponse.json({
      ok: true,
      fastCurrentInfo: true,
      category: typhoon ? "typhoon" : "current-affairs",
      result,
      sources: extractSources(payload),
      queriedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json(
        {
          ok: false,
          timeout: true,
          fastCurrentInfo: true,
          error: "即時搜尋超過7.5秒",
        },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        fastCurrentInfo: true,
        error: error instanceof Error ? error.message : "即時搜尋失敗",
      },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
