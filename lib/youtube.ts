export type YouTubeSearchResult = {
  videoId: string;
  title: string;
  channelTitle: string;
  query: string;
  watchUrl: string;
};

export type YouTubeApiReason =
  | "missing_key"
  | "invalid_key"
  | "api_not_enabled"
  | "key_restriction"
  | "quota_exceeded"
  | "network_error"
  | "no_results"
  | "unknown";

export class YouTubeApiError extends Error {
  status: number;
  reason: YouTubeApiReason;
  googleReason?: string;

  constructor(
    message: string,
    options: {
      status?: number;
      reason?: YouTubeApiReason;
      googleReason?: string;
    } = {},
  ) {
    super(message);
    this.name = "YouTubeApiError";
    this.status = options.status ?? 502;
    this.reason = options.reason ?? "unknown";
    this.googleReason = options.googleReason;
  }
}

function classifyGoogleError(payload: any, status: number) {
  const googleReason =
    payload?.error?.errors?.[0]?.reason ??
    payload?.error?.status ??
    "unknown";
  const message =
    payload?.error?.message ?? `YouTube Data API 錯誤：${status}`;
  const normalized = `${googleReason} ${message}`.toLowerCase();

  if (
    normalized.includes("api key not valid") ||
    normalized.includes("keyinvalid") ||
    normalized.includes("invalid key")
  ) {
    return { reason: "invalid_key" as const, googleReason, message };
  }

  if (
    normalized.includes("accessnotconfigured") ||
    normalized.includes("api has not been used") ||
    normalized.includes("disabled")
  ) {
    return { reason: "api_not_enabled" as const, googleReason, message };
  }

  if (
    normalized.includes("quota") ||
    normalized.includes("dailylimit") ||
    normalized.includes("ratelimit")
  ) {
    return { reason: "quota_exceeded" as const, googleReason, message };
  }

  if (
    normalized.includes("referer") ||
    normalized.includes("iprefererblocked") ||
    normalized.includes("forbidden") ||
    normalized.includes("restriction")
  ) {
    return { reason: "key_restriction" as const, googleReason, message };
  }

  return { reason: "unknown" as const, googleReason, message };
}

export function youtubeErrorSuggestion(reason: YouTubeApiReason) {
  if (reason === "missing_key") return "請在 .env.local 設定 YOUTUBE_API_KEY，然後重新啟動NUBO。";
  if (reason === "invalid_key") return "請確認Google Cloud API Key完整、未刪除，且沒有多餘空白。";
  if (reason === "api_not_enabled") return "請在同一個Google Cloud專案啟用 YouTube Data API v3。";
  if (reason === "key_restriction") return "此請求由本機Next.js後端送出；請勿使用網站HTTP參照網址限制。可先取消應用程式限制測試，API限制只保留 YouTube Data API v3。";
  if (reason === "quota_exceeded") return "YouTube搜尋配額已用完，請到Google Cloud配額頁查看，或等待每日配額重置。";
  if (reason === "network_error") return "請確認電腦可連線到 googleapis.com，且防火牆或防毒軟體沒有阻擋Node.js。";
  if (reason === "no_results") return "搜尋成功，但沒有找到符合可嵌入與站外播放條件的影片。";
  return "請開啟 /api/youtube/status 查看Google回傳的詳細原因。";
}

export async function searchYouTubeVideo(
  query: string,
): Promise<YouTubeSearchResult> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new YouTubeApiError("YOUTUBE_API_KEY 尚未設定", {
      status: 503,
      reason: "missing_key",
    });
  }

  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: "5",
    videoEmbeddable: "true",
    videoSyndicated: "true",
    safeSearch: "moderate",
    regionCode: "TW",
    relevanceLanguage: "zh-Hant",
    fields: "items(id/videoId,snippet/title,snippet/channelTitle)",
    key: apiKey,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  let response: Response;
  try {
    response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
      { cache: "no-store", signal: controller.signal },
    );
  } catch (error) {
    throw new YouTubeApiError(
      error instanceof Error && error.name === "AbortError"
        ? "YouTube Data API連線逾時"
        : "無法連線到YouTube Data API",
      { status: 502, reason: "network_error" },
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const classified = classifyGoogleError(payload, response.status);
    throw new YouTubeApiError(classified.message, {
      status: response.status,
      reason: classified.reason,
      googleReason: classified.googleReason,
    });
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const match = items.find(
    (item: any) =>
      typeof item?.id?.videoId === "string" &&
      typeof item?.snippet?.title === "string",
  );

  if (!match) {
    throw new YouTubeApiError("找不到可嵌入播放的YouTube影片", {
      status: 404,
      reason: "no_results",
    });
  }

  return {
    videoId: match.id.videoId,
    title: match.snippet.title,
    channelTitle: match.snippet.channelTitle ?? "",
    query,
    watchUrl: `https://www.youtube.com/watch?v=${match.id.videoId}`,
  };
}
