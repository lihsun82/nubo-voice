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
  apiVersion: string;
};

type GeminiTokenGlobal = typeof globalThis & {
  __nuboGeminiTokenCache?: GeminiTokenCache | null;
  __nuboGeminiTokenPromise?: Promise<GeminiTokenCache> | null;
};

type UpstreamFailure = {
  endpoint: string;
  status: number;
  code?: string;
  message?: string;
};

const geminiGlobal = globalThis as GeminiTokenGlobal;

const DEFAULT_TOKEN_USES = 10;
const DEFAULT_NEW_SESSION_MS = 5 * 60_000;
const CACHE_SAFETY_MS = 15_000;

function getGeminiApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ""
  ).trim();
}

function getTokenUses() {
  const raw = Number(
    process.env.GEMINI_AUTH_TOKEN_USES ?? DEFAULT_TOKEN_USES,
  );
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_TOKEN_USES;
  return Math.min(Math.floor(raw), 50);
}

function getNewSessionMs() {
  const raw = Number(
    process.env.GEMINI_AUTH_TOKEN_NEW_SESSION_SECONDS ?? 300,
  );
  if (!Number.isFinite(raw) || raw < 60) return DEFAULT_NEW_SESSION_MS;
  return Math.min(Math.floor(raw * 1000), 30 * 60_000);
}

function isCacheUsable(cache: GeminiTokenCache | null | undefined) {
  if (!cache) return false;
  if (cache.usesRemaining <= 0) return false;
  return Date.now() + CACHE_SAFETY_MS < cache.newSessionExpiresAt;
}

function upstreamMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

function upstreamCode(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { status?: unknown; code?: unknown }).status;
  if (typeof code === "string") return code;
  const numericCode = (error as { code?: unknown }).code;
  return typeof numericCode === "number" ? String(numericCode) : undefined;
}

async function createGeminiAuthToken(): Promise<GeminiTokenCache> {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    throw new Error("MISSING_GEMINI_API_KEY");
  }

  const model =
    process.env.GEMINI_LIVE_MODEL ??
    "gemini-3.1-flash-live-preview";
  const now = Date.now();
  const uses = getTokenUses();
  const newSessionMs = getNewSessionMs();
  const body = JSON.stringify({
    uses,
    expireTime: new Date(now + 30 * 60_000).toISOString(),
    newSessionExpireTime: new Date(now + newSessionMs).toISOString(),
  });

  /*
   * Google目前文件使用v1beta建立Live API暫時性權杖。
   * 保留v1alpha備援，避免不同專案或區域仍只開放舊端點。
   */
  const endpoints = [
    "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
    "https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
  ];

  const failures: UpstreamFailure[] = [];

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body,
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));

    if (response.ok && typeof payload?.name === "string") {
      return {
        token: payload.name,
        model,
        expiresAt: payload.expireTime,
        newSessionExpiresAt: now + newSessionMs,
        usesRemaining: uses,
        createdAt: now,
        apiVersion: endpoint.includes("/v1beta/")
          ? "v1beta"
          : "v1alpha",
      };
    }

    failures.push({
      endpoint,
      status: response.status,
      code: upstreamCode(payload),
      message: upstreamMessage(payload),
    });
  }

  console.error("[NUBO voice session] upstream token failure", failures);

  const last = failures[failures.length - 1];
  throw new Error(
    `GEMINI_AUTH_TOKEN_FAILED:${last?.status ?? 0}:${last?.code ?? "UNKNOWN"}`,
  );
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

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "MISSING_GEMINI_API_KEY") {
    return {
      status: 503,
      error: "NUBO語音服務尚未連結Gemini API Key。",
      reason: "missing_api_key",
    };
  }

  const match = message.match(
    /^GEMINI_AUTH_TOKEN_FAILED:(\d+):(.+)$/,
  );

  if (match) {
    const upstreamStatus = Number(match[1]);
    const code = match[2];

    if (upstreamStatus === 400) {
      return {
        status: 502,
        error: "NUBO語音權杖格式或API版本不相容，系統已嘗試雙版本備援。",
        reason: "invalid_token_request",
        upstreamStatus,
        code,
      };
    }

    if (upstreamStatus === 401 || upstreamStatus === 403) {
      return {
        status: 502,
        error: "NUBO語音使用的Gemini API Key無效、受限或沒有Live API權限。",
        reason: "api_key_denied",
        upstreamStatus,
        code,
      };
    }

    if (upstreamStatus === 429) {
      return {
        status: 503,
        error: "NUBO語音API目前已達額度或速率限制，請稍後再試。",
        reason: "quota_or_rate_limit",
        upstreamStatus,
        code,
      };
    }

    return {
      status: 502,
      error: "NUBO語音工作階段建立失敗，Google語音服務暫時無法核發權杖。",
      reason: "upstream_failure",
      upstreamStatus,
      code,
    };
  }

  return {
    status: 502,
    error: "NUBO語音工作階段建立失敗，請稍後再試。",
    reason: "unknown",
  };
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
        apiVersion: cache.apiVersion,
        elapsedMs,
      });
    }

    cache.usesRemaining -= 1;

    return NextResponse.json({
      token: cache.token,
      model: cache.model,
      expiresAt: cache.expiresAt,
      usesRemaining: cache.usesRemaining,
      apiVersion: cache.apiVersion,
      cached: elapsedMs < 50,
      elapsedMs,
    });
  } catch (error) {
    console.error("[NUBO voice session] create failed", error);
    const failure = publicError(error);

    return NextResponse.json(
      failure,
      {
        status: failure.status,
        headers: {
          "Cache-Control": "no-store",
          "X-NUBO-Voice-Session": failure.reason,
        },
      },
    );
  }
}
