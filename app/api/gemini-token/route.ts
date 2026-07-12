import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GeminiTokenCache = {
  token: string;
  model: string;
  expiresAt?: string;
  newSessionExpiresAt: number;
  usesRemaining: number;
  createdAt: number;
};

type GeminiTokenGlobal = typeof globalThis & {
  __nuboGeminiTokenCache?: GeminiTokenCache | null;
  __nuboGeminiTokenPromise?: Promise<GeminiTokenCache> | null;
};

const geminiGlobal = globalThis as GeminiTokenGlobal;

const DEFAULT_TOKEN_USES = 10;
const DEFAULT_NEW_SESSION_MS = 5 * 60_000;
const CACHE_SAFETY_MS = 15_000;

function getTokenUses() {
  const raw = Number(process.env.GEMINI_AUTH_TOKEN_USES ?? DEFAULT_TOKEN_USES);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_TOKEN_USES;
  return Math.min(Math.floor(raw), 50);
}

function getNewSessionMs() {
  const raw = Number(process.env.GEMINI_AUTH_TOKEN_NEW_SESSION_SECONDS ?? 300);
  if (!Number.isFinite(raw) || raw < 60) return DEFAULT_NEW_SESSION_MS;
  return Math.min(Math.floor(raw * 1000), 30 * 60_000);
}

function isCacheUsable(cache: GeminiTokenCache | null | undefined) {
  if (!cache) return false;
  if (cache.usesRemaining <= 0) return false;
  return Date.now() + CACHE_SAFETY_MS < cache.newSessionExpiresAt;
}

async function createGeminiAuthToken(): Promise<GeminiTokenCache> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 尚未設定");
  }

  const model = process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";
  const now = Date.now();
  const uses = getTokenUses();
  const newSessionMs = getNewSessionMs();

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        uses,
        expireTime: new Date(now + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(now + newSessionMs).toISOString(),
      }),
      cache: "no-store",
    },
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || typeof payload?.name !== "string") {
    const message = payload?.error?.message ?? `Gemini Token 建立失敗：${response.status}`;
    throw new Error(message);
  }

  return {
    token: payload.name,
    model,
    expiresAt: payload.expireTime,
    newSessionExpiresAt: now + newSessionMs,
    usesRemaining: uses,
    createdAt: now,
  };
}

async function getCachedToken() {
  if (isCacheUsable(geminiGlobal.__nuboGeminiTokenCache)) {
    return geminiGlobal.__nuboGeminiTokenCache!;
  }

  if (!geminiGlobal.__nuboGeminiTokenPromise) {
    geminiGlobal.__nuboGeminiTokenPromise = createGeminiAuthToken()
      .then((token) => {
        geminiGlobal.__nuboGeminiTokenCache = token;
        return token;
      })
      .finally(() => {
        geminiGlobal.__nuboGeminiTokenPromise = null;
      });
  }

  return geminiGlobal.__nuboGeminiTokenPromise;
}

export async function GET(request: NextRequest) {
  try {
    const startedAt = Date.now();
    const url = new URL(request.url);
    const warm = url.searchParams.get("warm") === "1";

    const cache = await getCachedToken();
    const elapsedMs = Date.now() - startedAt;

    if (warm) {
      return NextResponse.json({
        ok: true,
        warmed: true,
        cached: elapsedMs < 50,
        model: cache.model,
        usesRemaining: cache.usesRemaining,
        elapsedMs,
      });
    }

    cache.usesRemaining -= 1;

    return NextResponse.json({
      token: cache.token,
      model: cache.model,
      expiresAt: cache.expiresAt,
      usesRemaining: cache.usesRemaining,
      cached: elapsedMs < 50,
      elapsedMs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Gemini Token 建立失敗",
      },
      { status: 502 },
    );
  }
}
