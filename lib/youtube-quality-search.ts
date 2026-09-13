import {
  YouTubeApiError,
  type YouTubeSearchResult,
} from "@/lib/youtube";

type SearchItem = {
  id?: { videoId?: string };
  snippet?: { title?: string; channelTitle?: string };
};

type VideoDetail = {
  id?: string;
  snippet?: { title?: string; channelTitle?: string };
  contentDetails?: {
    definition?: string;
    licensedContent?: boolean;
    duration?: string;
  };
  statistics?: { viewCount?: string };
  status?: { embeddable?: boolean };
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[\s　【】\[\]()（）<>《》·•:：,，.!！?？'"“”‘’_\-/]+/g, "");
}

function cleanQuery(value: string) {
  return value
    .replace(/^(請|幫我|我要|我想|想要)?\s*(播放|播|放|聽|想聽)/u, "")
    .replace(/(這首|歌曲|音樂|歌|mv|video)$/iu, "")
    .trim();
}

function parseDurationSeconds(value = "") {
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function scoreVideo(query: string, item: VideoDetail) {
  const title = item.snippet?.title ?? "";
  const channel = item.snippet?.channelTitle ?? "";
  const titleKey = normalize(title);
  const channelKey = normalize(channel);
  const queryKey = normalize(cleanQuery(query));
  const combined = `${titleKey}${channelKey}`;
  let score = 0;

  if (queryKey && titleKey.includes(queryKey)) score += 95;

  const queryWords = cleanQuery(query)
    .split(/[\s　+,&，、/]+/)
    .map(normalize)
    .filter((word) => word.length >= 2);
  for (const word of queryWords) {
    if (titleKey.includes(word)) score += 18;
    else if (channelKey.includes(word)) score += 8;
  }

  if (/topic$/i.test(channel.trim()) || /-topic$/i.test(channelKey)) score += 85;
  if (/official|官方|vevo/i.test(combined)) score += 65;
  if (/musicvideo|officialmv|官方mv|officialaudio|官方音源/i.test(combined)) score += 45;
  if (item.contentDetails?.licensedContent) score += 45;
  if (item.contentDetails?.definition === "hd") score += 22;

  const views = Number(item.statistics?.viewCount ?? 0);
  if (Number.isFinite(views) && views > 0) {
    score += Math.min(42, Math.log10(views + 1) * 6);
  }

  const seconds = parseDurationSeconds(item.contentDetails?.duration);
  if (seconds > 0 && seconds < 75) score -= 45;
  if (seconds > 900) score -= 18;

  const penalties = [
    "翻唱",
    "cover",
    "伴奏",
    "karaoke",
    "ktv",
    "reaction",
    "教學",
    "tutorial",
    "slowed",
    "reverb",
    "8d",
    "remix",
    "shorts",
    "片段",
    "剪輯",
    "現場",
    "live",
  ];

  for (const term of penalties) {
    const key = normalize(term);
    if (!queryKey.includes(key) && combined.includes(key)) score -= 38;
  }

  return score;
}

function classifyApiFailure(payload: unknown, status: number) {
  const body = payload as {
    error?: {
      message?: string;
      status?: string;
      errors?: Array<{ reason?: string }>;
    };
  };
  const message = body.error?.message ?? `YouTube Data API 錯誤：${status}`;
  const googleReason = body.error?.errors?.[0]?.reason ?? body.error?.status ?? "unknown";
  const normalized = `${googleReason} ${message}`.toLowerCase();

  if (normalized.includes("quota") || normalized.includes("dailylimit")) {
    return new YouTubeApiError(message, { status, reason: "quota_exceeded", googleReason });
  }
  if (normalized.includes("api key not valid") || normalized.includes("keyinvalid")) {
    return new YouTubeApiError(message, { status, reason: "invalid_key", googleReason });
  }
  if (normalized.includes("accessnotconfigured") || normalized.includes("disabled")) {
    return new YouTubeApiError(message, { status, reason: "api_not_enabled", googleReason });
  }
  if (status === 403) {
    return new YouTubeApiError(message, { status, reason: "key_restriction", googleReason });
  }
  return new YouTubeApiError(message, { status, reason: "unknown", googleReason });
}

async function fetchJson(url: string, signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal });
  } catch (error) {
    throw new YouTubeApiError(
      error instanceof Error && error.name === "AbortError"
        ? "YouTube Data API連線逾時"
        : "無法連線到YouTube Data API",
      { status: 502, reason: "network_error" },
    );
  }

  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw classifyApiFailure(payload, response.status);
  return payload;
}

export async function searchHighQualityYouTubeVideo(
  query: string,
): Promise<YouTubeSearchResult> {
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    throw new YouTubeApiError("YOUTUBE_API_KEY 尚未設定", {
      status: 503,
      reason: "missing_key",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const searchParams = new URLSearchParams({
      part: "snippet",
      q: cleanQuery(query) || query,
      type: "video",
      maxResults: "12",
      videoEmbeddable: "true",
      videoSyndicated: "true",
      safeSearch: "moderate",
      regionCode: "TW",
      relevanceLanguage: "zh-Hant",
      fields: "items(id/videoId,snippet/title,snippet/channelTitle)",
      key: apiKey,
    });

    const searchPayload = (await fetchJson(
      `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
      controller.signal,
    )) as { items?: SearchItem[] };

    const searchItems = Array.isArray(searchPayload.items)
      ? searchPayload.items.filter(
          (item): item is SearchItem & { id: { videoId: string } } =>
            typeof item.id?.videoId === "string" && Boolean(item.id.videoId),
        )
      : [];

    if (!searchItems.length) {
      throw new YouTubeApiError("找不到可嵌入播放的YouTube影片", {
        status: 404,
        reason: "no_results",
      });
    }

    const ids = searchItems.map((item) => item.id.videoId).join(",");
    const detailParams = new URLSearchParams({
      part: "snippet,contentDetails,statistics,status",
      id: ids,
      fields:
        "items(id,snippet/title,snippet/channelTitle,contentDetails/definition,contentDetails/licensedContent,contentDetails/duration,statistics/viewCount,status/embeddable)",
      key: apiKey,
    });

    let candidates: VideoDetail[] = [];
    try {
      const detailPayload = (await fetchJson(
        `https://www.googleapis.com/youtube/v3/videos?${detailParams.toString()}`,
        controller.signal,
      )) as { items?: VideoDetail[] };
      candidates = Array.isArray(detailPayload.items)
        ? detailPayload.items.filter(
            (item) =>
              typeof item.id === "string" &&
              item.status?.embeddable !== false &&
              typeof item.snippet?.title === "string",
          )
        : [];
    } catch {
      candidates = searchItems.map((item) => ({
        id: item.id.videoId,
        snippet: item.snippet,
      }));
    }

    const selected = candidates
      .map((item, index) => ({
        item,
        score: scoreVideo(query, item) - index * 0.8,
      }))
      .sort((a, b) => b.score - a.score)[0]?.item;

    if (!selected?.id || !selected.snippet?.title) {
      throw new YouTubeApiError("找不到高品質且可嵌入播放的YouTube影片", {
        status: 404,
        reason: "no_results",
      });
    }

    return {
      videoId: selected.id,
      title: selected.snippet.title,
      channelTitle: selected.snippet.channelTitle ?? "",
      query,
      watchUrl: `https://www.youtube.com/watch?v=${selected.id}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
