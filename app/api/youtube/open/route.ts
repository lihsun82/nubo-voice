import { NextResponse } from "next/server";
import { z } from "zod";
import {
  YouTubeApiError,
  youtubeErrorSuggestion,
} from "@/lib/youtube";
import { searchHighQualityYouTubeVideo } from "@/lib/youtube-quality-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NUBO_RELEASE = "V15.6.26-room-player-v38";

const schema = z.object({
  query: z.string().min(1).max(300),
  service: z.enum(["youtube", "youtube_music"]).default("youtube"),
});

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
      fallback: false,
      ...result,
      url: watchUrl,
      mobileUrl: watchUrl,
      playerUrl: watchUrl,
      mobileLabel: "YouTube",
      autoOpen: true,
      release: NUBO_RELEASE,
      build: "youtube-exact-room-player-v38",
      message: `已找到並準備自動播放：${result.title}`,
    });
  } catch (error) {
    const reason = error instanceof YouTubeApiError ? error.reason : "unknown";

    // Room playback must never dump the guest onto a manual YouTube search page.
    // If all exact resolvers fail, keep NUBO in control and report a real failure.
    return NextResponse.json({
      ok: false,
      fallback: false,
      query,
      autoOpen: false,
      reason,
      suggestion: youtubeErrorSuggestion(reason),
      release: NUBO_RELEASE,
      build: "youtube-exact-room-player-v38",
      message: "這首目前無法取得可自動播放的精確影片，請再說一次歌手與歌名。",
    });
  }
}
