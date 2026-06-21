import { NextResponse } from "next/server";
import { getEngineChain, isEngineConfigured, type EngineName } from "@/lib/ai-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function checkOllama(): Promise<boolean> {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function chooseVoiceProvider() {
  const requested = (process.env.NUBO_VOICE_PROVIDER ?? "gemini").toLowerCase();
  if (requested === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (requested === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

export async function GET() {
  const names: EngineName[] = ["gemini", "ollama", "groq", "openai"];
  const ollamaOnline = await checkOllama();
  const providers = names.map((name) => ({
    name,
    configured: name === "ollama" ? ollamaOnline : isEngineConfigured(name),
    model:
      name === "gemini"
        ? process.env.GEMINI_TEXT_MODEL ?? "gemini-3.5-flash"
        : name === "ollama"
          ? process.env.OLLAMA_MODEL ?? "qwen3:4b"
          : name === "groq"
            ? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile"
            : process.env.OPENAI_WORK_MODEL ?? process.env.NUBO_WORK_MODEL ?? "gpt-5.4-mini",
  }));

  return NextResponse.json({
    workChain: getEngineChain(false),
    researchChain: getEngineChain(true),
    voiceProvider: chooseVoiceProvider(),
    providers,
  });
}
