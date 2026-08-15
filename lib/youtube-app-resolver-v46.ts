import { YouTubeApiError, type YouTubeSearchResult } from "@/lib/youtube";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

type SearchItem = {
  id?: { videoId?: string };
  snippet?: { title?: string; channelTitle?: string };
};

function cleanQuery(value: string) {
  return value
    .replace(/^(?:請|幫我|我要|我想|想要)?\s*(?:播放|播|放|聽|想聽)/u, "")
    .replace(/(?:這首|歌曲|音樂|歌|mv|video)$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[\s　【】\[\]()（）<>《》·•:：,，.!！?？'"“”‘’_\-/]+/g, "");
}

function apiKeys() {
  return Array.from(
    new Set(
      [
        process.env.YOUTUBE_API_KEY,
        process.env.YOUTUBE_DATA_API_KEY,
        process.env.GOOGLE_API_KEY,
      ]
        .map((value) => value?.trim() ?? "")
        .filter(Boolean),
    ),
  );
}

function score(query: string, item: SearchItem, index: number) {
  const title = item.snippet?.title ?? "";
  const channel = item.snippet?.channelTitle ?? "";
  const q = normalize(cleanQuery(query) || query);
  const t = normalize(title);
  const c = normalize(channel);
  let value = 100 - index * 2;

  if (q && t.includes(q)) value += 140;
  for (const word of (cleanQuery(query) || query)
    .split(/[\s　+,&，、/]+/)
    .map(normalize)
    .filter((word) => word.length >= 2)) {
    if (t.includes(word)) value += 28;
    else if (c.includes(word)) value += 12;
  }

  if (/official|官方|vevo|topic/i.test(`${title} ${channel}`)) value += 70;
  if (/cover|翻唱|伴奏|karaoke|ktv|reaction|教學|tutorial|remix|shorts/i.test(`${title} ${channel}`)) {
    value -= 55;
  }
  return value;
}

async function searchWithKey(query: string, key: string): Promise<YouTubeSearchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    // External YouTube App playback does NOT need embeddable/syndicated filters.
    // Those V38 room-player constraints incorrectly rejected otherwise playable videos.
    const params = new URLSearchParams({
      part: "snippet",
      q: cleanQuery(query) || query,
      type: "video",
      maxResults: "15",
      safeSearch: "moderate",
      regionCode: "TW",
      relevanceLanguage: "zh-Hant",
      fields: "items(id/videoId,snippet/title,snippet/channelTitle)",
      key,
    });
    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      items?: SearchItem[];
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new YouTubeApiError(payload.error?.message ?? "YouTube搜尋失敗", {
        status: response.status,
        reason: response.status === 403 ? "key_restriction" : "unknown",
      });
    }

    const candidates = (payload.items ?? []).filter(
      (item) => typeof item.id?.videoId === "string" && VIDEO_ID_RE.test(item.id.videoId),
    );
    const selected = candidates
      .map((item, index) => ({ item, score: score(query, item, index) }))
      .sort((a, b) => b.score - a.score)[0]?.item;

    const videoId = selected?.id?.videoId;
    if (!videoId) {
      throw new YouTubeApiError("YouTube找不到影片", { status: 404, reason: "no_results" });
    }

    return {
      videoId,
      title: selected.snippet?.title ?? cleanQuery(query) || query,
      channelTitle: selected.snippet?.channelTitle ?? "",
      query,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveYouTubeAppVideoV46(query: string): Promise<YouTubeSearchResult> {
  let lastError: unknown = null;
  for (const key of apiKeys()) {
    try {
      return await searchWithKey(query, key);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof YouTubeApiError) throw lastError;
  throw new YouTubeApiError("YouTube API尚未設定或無法使用", {
    status: 503,
    reason: "missing_key",
  });
}
