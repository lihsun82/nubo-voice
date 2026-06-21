import { runGroqEngine } from "@/lib/groq-engine";
import { runOpenAIEngine } from "@/lib/openai-engine";

export type EngineName = "gemini" | "ollama" | "groq" | "openai";

export type EngineResult = {
  text: string;
  provider: EngineName;
  model: string;
  attempts: Array<{ provider: EngineName; error?: string }>;
};

type GenerateOptions = {
  needsCurrentSources?: boolean;
};

const DEFAULT_CHAIN: EngineName[] = ["gemini", "ollama", "groq", "openai"];
const WEB_CHAIN: EngineName[] = ["gemini", "groq", "openai", "ollama"];

function parseChain(value: string | undefined): EngineName[] {
  const allowed = new Set<EngineName>(["gemini", "ollama", "groq", "openai"]);
  const parsed = (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is EngineName => allowed.has(item as EngineName));
  return [...new Set(parsed)];
}

export function getEngineChain(needsCurrentSources = false): EngineName[] {
  const configured = parseChain(
    process.env.NUBO_AI_PROVIDER_CHAIN ?? process.env.NUBO_AI_PROVIDER,
  );
  if (configured.length === 0) {
    return needsCurrentSources ? WEB_CHAIN : DEFAULT_CHAIN;
  }
  if (!needsCurrentSources) return configured;
  const online = configured.filter((item) => item !== "ollama");
  return [...online, ...(configured.includes("ollama") ? ["ollama" as const] : [])];
}

export function isEngineConfigured(provider: EngineName): boolean {
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY);
  if (provider === "ollama") return true;
  if (provider === "groq") return Boolean(process.env.GROQ_API_KEY);
  return Boolean(process.env.OPENAI_API_KEY);
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs = 45_000,
): Promise<{ response: Response; payload: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(payload: any, fallback: string): string {
  return payload?.error?.message ?? payload?.message ?? payload?.error ?? fallback;
}

function geminiText(payload: any): string {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function geminiSources(payload: any): string[] {
  const chunks = payload?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  return chunks
    .map((chunk: any) => {
      const title = chunk?.web?.title;
      const uri = chunk?.web?.uri;
      return typeof uri === "string" ? `${title || "來源"}: ${uri}` : "";
    })
    .filter(Boolean)
    .slice(0, 8);
}

async function runGemini(prompt: string, needsCurrentSources: boolean) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY 尚未設定");
  const model = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.5-flash";
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      thinkingConfig: { thinkingLevel: "LOW" },
    },
  };
  if (needsCurrentSources) body.tools = [{ google_search: {} }];

  const { response, payload } = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(errorMessage(payload, `Gemini 回應錯誤：${response.status}`));
  }
  let text = geminiText(payload);
  if (!text) throw new Error("Gemini 沒有回傳可讀成果");
  const sources = needsCurrentSources ? geminiSources(payload) : [];
  if (sources.length > 0) text += `\n\n來源：\n${sources.map((item) => `- ${item}`).join("\n")}`;
  return { text, model };
}

async function runOllama(prompt: string) {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL ?? "qwen3:4b";
  const { response, payload } = await fetchJson(
    `${baseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: "你是 NUBO 的工作引擎，一律使用繁體中文並直接交付成果。" },
          { role: "user", content: prompt },
        ],
        options: { temperature: 0.2 },
      }),
      cache: "no-store",
    },
    120_000,
  );
  if (!response.ok) {
    throw new Error(errorMessage(payload, `Ollama 回應錯誤：${response.status}`));
  }
  const text = typeof payload?.message?.content === "string" ? payload.message.content.trim() : "";
  if (!text) throw new Error("Ollama 沒有回傳可讀成果");
  return { text, model };
}

export async function generateWithFallback(
  prompt: string,
  options: GenerateOptions = {},
): Promise<EngineResult> {
  const needsCurrentSources = options.needsCurrentSources ?? false;
  const attempts: EngineResult["attempts"] = [];
  const chain = getEngineChain(needsCurrentSources);

  for (const provider of chain) {
    if (!isEngineConfigured(provider)) {
      attempts.push({ provider, error: "未設定" });
      continue;
    }
    try {
      const result =
        provider === "gemini"
          ? await runGemini(prompt, needsCurrentSources)
          : provider === "ollama"
            ? await runOllama(prompt)
            : provider === "groq"
              ? await runGroqEngine(prompt, needsCurrentSources)
              : await runOpenAIEngine(prompt, needsCurrentSources);
      attempts.push({ provider });
      return { ...result, provider, attempts };
    } catch (error) {
      attempts.push({
        provider,
        error: error instanceof Error ? error.message : "未知錯誤",
      });
    }
  }

  const detail = attempts.map((item) => `${item.provider}: ${item.error}`).join("；");
  throw new Error(`所有 AI 引擎皆無法完成工作。${detail}`);
}
