export type YouTubeSearchResult = {
  videoId: string;
  title: string;
  channelTitle: string;
  query: string;
  watchUrl: string;
};

export async function searchYouTubeVideo(
  query: string,
): Promise<YouTubeSearchResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY 尚未設定");

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
    key: apiKey,
  });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
    { cache: "no-store" },
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        `YouTube Data API 錯誤：${response.status}`,
    );
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const match = items.find(
    (item: any) =>
      typeof item?.id?.videoId === "string" &&
      typeof item?.snippet?.title === "string",
  );

  if (!match) throw new Error("找不到可嵌入播放的YouTube影片");

  return {
    videoId: match.id.videoId,
    title: match.snippet.title,
    channelTitle: match.snippet.channelTitle ?? "",
    query,
    watchUrl: `https://www.youtube.com/watch?v=${match.id.videoId}`,
  };
}
