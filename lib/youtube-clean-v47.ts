export type CleanYouTubeResult = {
  ok: true;
  query: string;
  title: string;
  videoId: string;
  url: string;
  mobileUrl: string;
  playerUrl: string;
  mobileLabel: "YouTube";
  autoOpen: true;
  playbackMode: "exact-video" | "youtube-app-search";
  fallback: boolean;
  release: string;
  build: string;
  message: string;
};

const RELEASE = "V47-clean-youtube";

function youtubeSearchUrl(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
}

function uniqueVideoIds(html: string) {
  const ids: string[] = [];
  const seen = new Set<string>();
  const regex = /"videoId":"([A-Za-z0-9_-]{11})"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
    if (ids.length >= 12) break;
  }
  return ids;
}

async function resolveFirstPlayableVideoId(query: string) {
  const url = youtubeSearchUrl(query);
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.7",
    },
  });
  if (!response.ok) return "";
  const html = await response.text();
  return uniqueVideoIds(html)[0] ?? "";
}

export async function resolveCleanYouTubeV47(queryInput: string): Promise<CleanYouTubeResult> {
  const query = queryInput.trim();
  if (!query) throw new Error("缺少歌曲或影片名稱");

  try {
    const videoId = await resolveFirstPlayableVideoId(query);
    if (videoId) {
      const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
      return {
        ok: true,
        query,
        title: query,
        videoId,
        url: watchUrl,
        mobileUrl: watchUrl,
        playerUrl: watchUrl,
        mobileLabel: "YouTube",
        autoOpen: true,
        playbackMode: "exact-video",
        fallback: false,
        release: RELEASE,
        build: "youtube-clean-single-route-v47",
        message: `正在由 YouTube App 播放：${query}`,
      };
    }
  } catch {
    // Exact lookup is an accelerator only. Never block opening YouTube.
  }

  const searchUrl = youtubeSearchUrl(query);
  return {
    ok: true,
    query,
    title: query,
    videoId: "",
    url: searchUrl,
    mobileUrl: searchUrl,
    playerUrl: searchUrl,
    mobileLabel: "YouTube",
    autoOpen: true,
    playbackMode: "youtube-app-search",
    fallback: true,
    release: RELEASE,
    build: "youtube-clean-single-route-v47",
    message: `正在開啟 YouTube App 搜尋：${query}`,
  };
}
