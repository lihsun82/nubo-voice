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

type GeminiGroundingPayload = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: { uri?: string; title?: string };
      }>;
    };
  }>;
};

type YouTubeCacheEntry = {
  expiresAt: number;
  result: YouTubeSearchResult;
};

type YouTubeGlobal = typeof globalThis & {
  __nuboYouTubeExactCacheV38?: Map<string, YouTubeCacheEntry>;
};

const youtubeGlobal = globalThis as YouTubeGlobal;
const exactCache =
  youtubeGlobal.__nuboYouTubeExactCacheV38 ??
  new Map<string, YouTubeCacheEntry>();
youtubeGlobal.__nuboYouTubeExactCacheV38 = exactCache;

const CACHE_TTL_MS = 6 * 60 * 60_000;
const CACHE_MAX = 300;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

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

function cacheKey(query: string) {
  return normalize(cleanQuery(query) || query);
}

function readCache(query: string) {
  const key = cacheKey(query);
  const entry = exactCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    exactCache.delete(key);
    return null;
  }
  return entry.result;
}

function writeCache(query: string, result: YouTubeSearchResult) {
  if (exactCache.size >= CACHE_MAX) {
    const oldest = exactCache.keys().next().value as string | undefined;
    if (oldest) exactCache.delete(oldest);
  }
  exactCache.set(cacheKey(query), {
    expiresAt: Date.now() + CACHE_TTL_MS,
    result,
  });
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
        ? "YouTube服務連線逾時"
        : "無法連線到YouTube服務",
      { status: 502, reason: "network_error" },
    );
  }

  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw classifyApiFailure(payload, response.status);
  return payload;
}

function uniqueApiKeys() {
  return Array.from(
    new Set(
      [
        process.env.YOUTUBE_API_KEY,
        process.env.YOUTUBE_DATA_API_KEY,
        process.env.GOOGLE_API_KEY,
        process.env.GEMINI_API_KEY,
      ]
        .map((value) => value?.trim() ?? "")
        .filter(Boolean),
    ),
  );
}

async function searchWithYouTubeDataApi(
  query: string,
  apiKey: string,
): Promise<YouTubeSearchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

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
            typeof item.id?.videoId === "string" && VIDEO_ID_RE.test(item.id.videoId),
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
              VIDEO_ID_RE.test(item.id) &&
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

function extractVideoIds(value: string) {
  const ids = new Set<string>();
  const patterns = [
    /(?:youtube\.com\/watch\?[^\s#]*?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/gi,
    /(?:video(?:Id)?\s*[:=]\s*["']?)([A-Za-z0-9_-]{11})/gi,
  ];

  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      if (match[1] && VIDEO_ID_RE.test(match[1])) ids.add(match[1]);
    }
  }
  return [...ids];
}

async function resolveGroundedUri(uri: string) {
  if (!uri) return "";
  if (/youtube\.com|youtu\.be/i.test(uri)) return uri;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(uri, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    const finalUrl = response.url;
    try {
      await response.body?.cancel();
    } catch {
      // The redirect URL is already available; body cleanup is best effort.
    }
    return finalUrl;
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function validateWithOEmbed(
  query: string,
  videoId: string,
): Promise<YouTubeSearchResult | null> {
  if (!VIDEO_ID_RE.test(videoId)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const url =
      "https://www.youtube.com/oembed?format=json&url=" +
      encodeURIComponent(watchUrl);
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => ({}))) as {
      title?: string;
      author_name?: string;
    };
    if (!payload.title) return null;
    return {
      videoId,
      title: payload.title,
      channelTitle: payload.author_name ?? "",
      query,
      watchUrl,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchWithGeminiGrounding(
  query: string,
): Promise<YouTubeSearchResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new YouTubeApiError("精確音樂搜尋服務尚未設定", {
      status: 503,
      reason: "missing_key",
    });
  }

  const model = process.env.GEMINI_SEARCH_MODEL?.trim() || "gemini-2.5-flash";
  const cleaned = cleanQuery(query) || query;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    "你是NUBO的YouTube音樂解析器。請使用Google Search搜尋最符合下列需求的YouTube影片：\n" +
                    cleaned +
                    "\n優先順序：歌手或唱片公司官方頻道、YouTube Topic、官方MV、官方音源。排除翻唱、伴奏、reaction、shorts、混音與非使用者指定的現場版。請提供最多3個候選，每行只放完整的 https://www.youtube.com/watch?v=VIDEO_ID 網址。",
                },
              ],
            },
          ],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 240,
          },
        }),
        cache: "no-store",
        signal: controller.signal,
      },
    );

    const payload = (await response.json().catch(() => ({}))) as GeminiGroundingPayload & {
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new YouTubeApiError(
        payload.error?.message ?? "NUBO精確音樂搜尋失敗",
        { status: response.status, reason: "unknown" },
      );
    }

    const candidate = payload.candidates?.[0];
    const rawTexts = (candidate?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .filter(Boolean);
    const groundedUris = (candidate?.groundingMetadata?.groundingChunks ?? [])
      .map((chunk) => chunk.web?.uri ?? "")
      .filter(Boolean);

    const ids = new Set<string>();
    for (const text of rawTexts) {
      for (const id of extractVideoIds(text)) ids.add(id);
    }

    for (const uri of groundedUris.slice(0, 8)) {
      const resolved = await resolveGroundedUri(uri);
      for (const id of extractVideoIds(`${uri} ${resolved}`)) ids.add(id);
    }

    const validated = (
      await Promise.all(
        [...ids].slice(0, 8).map((id) => validateWithOEmbed(query, id)),
      )
    ).filter((item): item is YouTubeSearchResult => Boolean(item));

    const selected = validated
      .map((item, index) => ({
        item,
        score:
          scoreVideo(query, {
            id: item.videoId,
            snippet: {
              title: item.title,
              channelTitle: item.channelTitle,
            },
          }) -
          index * 0.5,
      }))
      .sort((a, b) => b.score - a.score)[0]?.item;

    if (!selected) {
      throw new YouTubeApiError("找不到可驗證並自動播放的YouTube影片", {
        status: 404,
        reason: "no_results",
      });
    }

    return selected;
  } catch (error) {
    if (error instanceof YouTubeApiError) throw error;
    throw new YouTubeApiError(
      error instanceof Error && error.name === "AbortError"
        ? "NUBO精確音樂搜尋逾時"
        : "NUBO精確音樂搜尋失敗",
      { status: 502, reason: "network_error" },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchHighQualityYouTubeVideo(
  query: string,
): Promise<YouTubeSearchResult> {
  const cached = readCache(query);
  if (cached) return cached;

  let lastError: unknown = null;
  for (const apiKey of uniqueApiKeys()) {
    try {
      const result = await searchWithYouTubeDataApi(query, apiKey);
      writeCache(query, result);
      return result;
    } catch (error) {
      lastError = error;
    }
  }

  try {
    const result = await searchWithGeminiGrounding(query);
    writeCache(query, result);
    return result;
  } catch (error) {
    lastError = error;
  }

  if (lastError instanceof YouTubeApiError) throw lastError;
  throw new YouTubeApiError("找不到可自動播放的YouTube影片", {
    status: 503,
    reason: "unknown",
  });
}
