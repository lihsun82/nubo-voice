import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GeminiApiVersion = "v1alpha" | "v1beta";

type GeminiTokenCache = {
  token: string;
  model: string;
  expiresAt?: string;
  newSessionExpiresAt: number;
  usesRemaining: number;
  createdAt: number;
  apiVersion: GeminiApiVersion;
  requestMode: "timed" | "minimal";
};

type GeminiTokenGlobal = typeof globalThis & {
  __nuboGeminiTokenCache?: GeminiTokenCache | null;
  __nuboGeminiTokenPromise?: Promise<GeminiTokenCache> | null;
};

type UpstreamFailure = {
  apiVersion: GeminiApiVersion;
  requestMode: "timed" | "minimal";
  status: number;
  code?: string;
  message?: string;
};

class AuthTokenCreationError extends Error {
  failures: UpstreamFailure[];

  constructor(failures: UpstreamFailure[]) {
    super("GEMINI_AUTH_TOKEN_FAILED");
    this.name = "AuthTokenCreationError";
    this.failures = failures;
  }
}

const geminiGlobal = globalThis as GeminiTokenGlobal;

const CACHE_SAFETY_MS = 15_000;
const TOKEN_EXPIRE_MS = 30 * 60_000;
const CONFIGURED_NEW_SESSION_MS = 5 * 60_000;
const MINIMAL_NEW_SESSION_MS = 55_000;

function getGeminiApiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ""
  ).trim();
}

function getNewSessionMs() {
  const raw = Number(
    process.env.GEMINI_AUTH_TOKEN_NEW_SESSION_SECONDS ?? 300,
  );

  if (!Number.isFinite(raw) || raw < 60) {
    return CONFIGURED_NEW_SESSION_MS;
  }

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

  const status = (error as { status?: unknown }).status;
  if (typeof status === "string") return status;

  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? String(code) : undefined;
}

function buildAttempts(now: number) {
  const newSessionMs = getNewSessionMs();
  const timedBody = JSON.stringify({
    uses: 1,
    expireTime: new Date(now + TOKEN_EXPIRE_MS).toISOString(),
    newSessionExpireTime: new Date(now + newSessionMs).toISOString(),
  });
  const minimalBody = JSON.stringify({ uses: 1 });

  /*
   * 前端目前使用 v1alpha 的 BidiGenerateContentConstrained WebSocket，
   * 因此先以 v1alpha 建立相同版本的暫時權杖。
   * v1beta 保留為 Google 新版端點備援。
   * 每個版本再以最小請求重試，排除時間欄位或專案政策差異。
   */
  return [
    {
      apiVersion: "v1alpha" as const,
      requestMode: "timed" as const,
      body: timedBody,
      newSessionExpiresAt: now + newSessionMs,
    },
    {
      apiVersion: "v1alpha" as const,
      requestMode: "minimal" as const,
      body: minimalBody,
      newSessionExpiresAt: now + MINIMAL_NEW_SESSION_MS,
    },
    {
      apiVersion: "v1beta" as const,
      requestMode: "timed" as const,
      body: timedBody,
      newSessionExpiresAt: now + newSessionMs,
    },
    {
      apiVersion: "v1beta" as const,
      requestMode: "minimal" as const,
      body: minimalBody,
      newSessionExpiresAt: now + MINIMAL_NEW_SESSION_MS,
    },
  ];
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
  const failures: UpstreamFailure[] = [];

  for (const attempt of buildAttempts(now)) {
    const endpoint =
      `https://generativelanguage.googleapis.com/${attempt.apiVersion}/auth_tokens`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: attempt.body,
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));

    if (response.ok && typeof payload?.name === "string") {
      return {
        token: payload.name,
        model,
        expiresAt: payload.expireTime,
        newSessionExpiresAt: attempt.newSessionExpiresAt,
        usesRemaining: 1,
        createdAt: now,
        apiVersion: attempt.apiVersion,
        requestMode: attempt.requestMode,
      };
    }

    failures.push({
      apiVersion: attempt.apiVersion,
      requestMode: attempt.requestMode,
      status: response.status,
      code: upstreamCode(payload),
      message: upstreamMessage(payload),
    });
  }

  console.error(
    "[NUBO voice session] upstream token failure",
    failures,
  );

  throw new AuthTokenCreationError(failures);
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
  if (error instanceof Error && error.message === "MISSING_GEMINI_API_KEY") {
    return {
      status: 503,
      error: "NUBO語音服務尚未連結Gemini API Key。",
      reason: "missing_api_key",
    };
  }

  if (error instanceof AuthTokenCreationError) {
    const failures = error.failures;
    const statuses = failures.map((failure) => failure.status);

    if (statuses.some((status) => status === 401 || status === 403)) {
      return {
        status: 502,
        error: "NUBO語音使用的Gemini API Key無效、受限或沒有Live API權限。",
        reason: "api_key_denied",
      };
    }

    if (statuses.some((status) => status === 429)) {
      return {
        status: 503,
        error: "NUBO語音API目前已達額度或速率限制，請稍後再試。",
        reason: "quota_or_rate_limit",
      };
    }

    if (statuses.every((status) => status === 400 || status === 404)) {
      return {
        status: 502,
        error: "NUBO語音暫時權杖建立失敗，已嘗試相容與最小格式。",
        reason: "invalid_token_request",
      };
    }

    return {
      status: 502,
      error: "NUBO語音工作階段建立失敗，Google語音服務暫時無法核發權杖。",
      reason: "upstream_failure",
    };
  }

  return {
    status: 502,
    error: "NUBO語音工作階段建立失敗，請稍後再試。",
    reason: "unknown",
  };
}

function safeDiagnostics(error: unknown) {
  if (!(error instanceof AuthTokenCreationError)) return undefined;

  return error.failures.map((failure) => ({
    apiVersion: failure.apiVersion,
    requestMode: failure.requestMode,
    status: failure.status,
    code: failure.code,
    message: failure.message,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const startedAt = Date.now();
    const url = new URL(request.url);
    const warm = url.searchParams.get("warm") === "1";

    const cache = await getCachedToken();
    const elapsedMs = Date.now() - startedAt;

    if (warm) {
      return NextResponse.json(
        {
          ok: true,
          warmed: true,
          cached: elapsedMs < 50,
          model: cache.model,
          usesRemaining: cache.usesRemaining,
          apiVersion: cache.apiVersion,
          requestMode: cache.requestMode,
          elapsedMs,
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    cache.usesRemaining -= 1;

    return NextResponse.json(
      {
        token: cache.token,
        model: cache.model,
        expiresAt: cache.expiresAt,
        usesRemaining: cache.usesRemaining,
        apiVersion: cache.apiVersion,
        requestMode: cache.requestMode,
        cached: elapsedMs < 50,
        elapsedMs,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-NUBO-Gemini-API-Version": cache.apiVersion,
        },
      },
    );
  } catch (error) {
    console.error("[NUBO voice session] create failed", error);
    const failure = publicError(error);
    const debug = new URL(request.url).searchParams.get("debug") === "1";

    return NextResponse.json(
      {
        ...failure,
        ...(debug
          ? {
              diagnostics: safeDiagnostics(error),
              hasApiKey: Boolean(getGeminiApiKey()),
            }
          : {}),
      },
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
