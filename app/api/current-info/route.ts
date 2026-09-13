import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  question: z.string().trim().min(2).max(1200),
});

type NewsItem = {
  title: string;
  link: string;
  publishedAt: string;
  source: string;
};

function isTyphoonQuestion(question: string) {
  return /(颱風|台風|熱帶性低氣壓|熱帶低壓|颱風警報|海上警報|陸上警報)/i.test(
    question,
  );
}

function isDisasterQuestion(question: string) {
  return /(豪雨|大雨特報|地震|停班停課|強風|海嘯)/i.test(question);
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

async function fetchText(url: string, timeoutMs = 2800) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": "NUBO-Current-Agent/1.0",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.6",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseGoogleNewsRss(xml: string): NewsItem[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.slice(0, 7).map((item) => {
    const read = (tag: string) => {
      const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return decodeXml(match?.[1] ?? "");
    };
    const sourceMatch = item.match(/<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i);
    return {
      title: read("title"),
      link: read("link"),
      publishedAt: read("pubDate"),
      source: decodeXml(sourceMatch?.[1] ?? ""),
    };
  }).filter((item) => item.title);
}

async function searchGoogleNews(question: string, typhoon: boolean) {
  const query = typhoon
    ? "(颱風 OR 熱帶性低氣壓 OR 颱風警報) (中央氣象署 OR CWA)"
    : question;
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "zh-TW");
  url.searchParams.set("gl", "TW");
  url.searchParams.set("ceid", "TW:zh-Hant");
  try {
    return parseGoogleNewsRss(await fetchText(url.toString(), 2600));
  } catch {
    return [];
  }
}

function collectRelevantStrings(value: unknown, output: string[], depth = 0) {
  if (depth > 8 || output.length >= 40) return;
  if (typeof value === "string") {
    const text = value.trim();
    if (
      text &&
      text.length <= 650 &&
      /(颱風|熱帶|警報|中心位置|移速|路徑|強度|發布|解除|豪雨|大雨|地震|強風)/.test(text)
    ) {
      output.push(text);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectRelevantStrings(item, output, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectRelevantStrings(item, output, depth + 1),
    );
  }
}

async function fetchCwaDirect() {
  const apiKey =
    process.env.CWA_API_KEY ||
    process.env.CWA_AUTHORIZATION ||
    process.env.CWA_AUTH_KEY ||
    "";
  if (!apiKey) return { configured: false, summaries: [] as string[] };

  const datasets = ["W-C0034-005", "W-C0033-001"];
  const results = await Promise.allSettled(
    datasets.map(async (dataId) => {
      const url = new URL(
        `https://opendata.cwa.gov.tw/api/v1/rest/datastore/${dataId}`,
      );
      url.searchParams.set("Authorization", apiKey);
      url.searchParams.set("format", "JSON");
      const text = await fetchText(url.toString(), 2400);
      return JSON.parse(text) as unknown;
    }),
  );

  const summaries: string[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    collectRelevantStrings(result.value, summaries);
  }
  return {
    configured: true,
    summaries: [...new Set(summaries)].slice(0, 12),
  };
}

function newsResult(items: NewsItem[]) {
  return items.slice(0, 5).map((item, index) => {
    const source = item.source ? `（${item.source}）` : "";
    const date = item.publishedAt ? `｜${item.publishedAt}` : "";
    return `${index + 1}. ${item.title}${source}${date}`;
  }).join("\n");
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

async function fallbackWebSearch(question: string, typhoon: boolean, now: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3600);
  try {
    const tool = typhoon
      ? {
          type: "web_search",
          search_context_size: "low",
          filters: { allowed_domains: ["cwa.gov.tw", "opendata.cwa.gov.tw"] },
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
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.NUBO_CURRENT_INFO_MODEL || "gpt-5-nano",
        input: `台灣時間 ${now}。先搜尋再用繁體中文用 2 到 4 句直接回答：${question}`,
        tools: [tool],
        tool_choice: "required",
        store: false,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return "";
    return extractOutputText(payload);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "即時查詢問題不完整" }, { status: 400 });
  }

  const question = parsed.data.question;
  const typhoon = isTyphoonQuestion(question);
  const disaster = isDisasterQuestion(question);
  const now = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

  const startedAt = Date.now();
  const [cwa, news] = await Promise.all([
    typhoon || disaster
      ? fetchCwaDirect().catch(() => ({ configured: false, summaries: [] as string[] }))
      : Promise.resolve({ configured: false, summaries: [] as string[] }),
    searchGoogleNews(question, typhoon),
  ]);

  if (cwa.summaries.length > 0) {
    return NextResponse.json({
      ok: true,
      fastCurrentInfo: true,
      category: typhoon ? "typhoon" : "disaster",
      sourceMode: "cwa-direct",
      result:
        `中央氣象署即時資料（查詢時間 ${now}）：\n` +
        cwa.summaries.slice(0, 8).map((item) => `- ${item}`).join("\n"),
      sources: [
        "https://opendata.cwa.gov.tw/dataset/warning/W-C0034-005",
        "https://opendata.cwa.gov.tw/dataset/warning/W-C0033-001",
      ],
      elapsedMs: Date.now() - startedAt,
    });
  }

  if (news.length > 0) {
    return NextResponse.json({
      ok: true,
      fastCurrentInfo: true,
      category: typhoon ? "typhoon" : "current-affairs",
      sourceMode: typhoon ? "news-cwa-priority" : "news-rss",
      result:
        `${typhoon ? "颱風／氣象最新公開資訊" : "最新公開資訊"}（查詢時間 ${now}）：\n` +
        newsResult(news),
      sources: news.slice(0, 5).map((item) => item.link),
      cwaApiConfigured: cwa.configured,
      elapsedMs: Date.now() - startedAt,
    });
  }

  const fallback = await fallbackWebSearch(question, typhoon, now);
  if (fallback) {
    return NextResponse.json({
      ok: true,
      fastCurrentInfo: true,
      category: typhoon ? "typhoon" : "current-affairs",
      sourceMode: "web-search-fallback",
      result: fallback,
      elapsedMs: Date.now() - startedAt,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      fastCurrentInfo: true,
      category: typhoon ? "typhoon" : "current-affairs",
      error: "目前所有快速即時來源都沒有回傳可驗證資料，請勿用模型記憶猜測。",
      elapsedMs: Date.now() - startedAt,
    },
    { status: 503 },
  );
}
