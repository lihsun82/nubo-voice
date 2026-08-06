import { NextResponse } from "next/server";
import { z } from "zod";
import {
  YouTubeApiError,
  youtubeErrorSuggestion,
} from "@/lib/youtube";
import { searchHighQualityYouTubeVideo } from "@/lib/youtube-quality-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NUBO_RELEASE = "V15.6.25";

const schema = z.object({
  query: z.string().min(1).max(300),
  service: z.enum(["youtube", "youtube_music"]).default("youtube"),
});

function youtubeSearchUrl(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少歌曲或影片名稱" }, { status: 400 });
  }

  const { query } = parsed.data;

  try {
    const result = await searchHighQualityYouTubeVideo(query);
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(result.videoId)}&autoplay=1`;

    return NextResponse.json({
      ok: true,
      ...result,
      url: watchUrl,
      mobileUrl: watchUrl,
      playerUrl: watchUrl,
      mobileLabel: "YouTube",
      autoOpen: true,
      release: NUBO_RELEASE,
      build: "youtube-direct-watch-or-search-v15-6-25",
      message: `已找到並準備播放：${result.title}`,
    });
  } catch (error) {
    const fallbackUrl = youtubeSearchUrl(query);
    const reason = error instanceof YouTubeApiError ? error.reason : "unknown";

    // API Key遺失、配額用完或搜尋服務異常時，仍回傳可開啟的YouTube搜尋頁。
    return NextResponse.json({
      ok: true,
      fallback: true,
      query,
      url: fallbackUrl,
      mobileUrl: fallbackUrl,
      playerUrl: fallbackUrl,
      mobileLabel: "YouTube",
      autoOpen: true,
      reason,
      suggestion: youtubeErrorSuggestion(reason),
      release: NUBO_RELEASE,
      build: "youtube-direct-watch-or-search-v15-6-25",
      message: "精確搜尋暫時不可用，已改開YouTube搜尋結果。",
    });
  }
}
