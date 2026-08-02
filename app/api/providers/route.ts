import { NextResponse } from "next/server";
import { isEngineConfigured, type EngineName } from "@/lib/ai-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_IDENTITY = "LEO開發的LLM語言模型";

async function checkLocalCore(): Promise<boolean> {
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

export async function GET() {
  const names: EngineName[] = ["gemini", "ollama", "groq", "openai"];
  const localCoreOnline = await checkLocalCore();
  const configuredCoreCount = names.filter((name) =>
    name === "ollama" ? localCoreOnline : isEngineConfigured(name),
  ).length;

  return NextResponse.json(
    {
      ready: configuredCoreCount > 0,
      configuredCoreCount,
      publicIdentity: PUBLIC_IDENTITY,
      workChain: [PUBLIC_IDENTITY],
      researchChain: [PUBLIC_IDENTITY],
      voiceProvider: PUBLIC_IDENTITY,
      providers: [
        {
          name: PUBLIC_IDENTITY,
          configured: configuredCoreCount > 0,
          model: PUBLIC_IDENTITY,
        },
      ],
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
