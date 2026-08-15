import { NextResponse } from "next/server";
import { z } from "zod";
import { YouTubeApiError } from "@/lib/youtube";
import { resolveYouTubeAppVideoV46 } from "@/lib/youtube-app-resolver-v46";
import { searchHighQualityYouTubeVideo } from "@/lib/youtube-quality-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NUBO_RELEASE = "V46-youtube-canonical-external-app";

const schema = z.object({
  query: z.string().min(1).max(300),
  service: z.enum(["youtube", "youtube_music"]).default("youtube"),
});

function searchUrl(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少歌曲或影片名稱" }, { status: 400 });
  }

  const { query } = parsed.data;
  let lastReason = "unknown";

  // V46 first resolver is designed for EXTERNAL YouTube App playback.
  // It intentionally does not require embeddable/syndicated/oEmbed eligibility.
  try {
    const result = await resolveYouTubeAppVideoV46(query);
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(result.videoId)}&autoplay=1`;
    return NextResponse.json({
      ok: true,
      fallback: false,
      playbackMode: "exact-video",
      ...result,
      url: watchUrl,
      mobileUrl: watchUrl,
      playerUrl: watchUrl,
      mobileLabel: "YouTube",
      autoOpen: true,
      release: NUBO_RELEASE,
      build: "youtube-canonical-external-app-v46",
      message: `準備由YouTube App播放：${result.title}`,
    });
  } catch (error) {
    lastReason = error instanceof YouTubeApiError ? error.reason : "unknown";
  }

  // Keep the previous multi-resolver as a secondary chance, but it is no longer
  // allowed to block opening YouTube when it cannot validate an exact video.
  try {
    const result = await searchHighQualityYouTubeVideo(query);
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(result.videoId)}&autoplay=1`;
    return NextResponse.json({
      ok: true,
      fallback: false,
      playbackMode: "legacy-exact-video",
      ...result,
      url: watchUrl,
      mobileUrl: watchUrl,
      playerUrl: watchUrl,
      mobileLabel: "YouTube",
      autoOpen: true,
      release: NUBO_RELEASE,
      build: "youtube-canonical-external-app-v46",
      message: `準備由YouTube App播放：${result.title}`,
    });
  } catch (error) {
    lastReason = error instanceof YouTubeApiError ? error.reason : lastReason;
  }

  // Critical V46 behavior: exact-video lookup failure is NOT playback failure.
  // Always hand the query to the installed YouTube App instead of returning the
  // old V38 red error and preventing Android startActivity() from ever running.
  const fallbackUrl = searchUrl(query);
  return NextResponse.json({
    ok: true,
    fallback: true,
    playbackMode: "youtube-app-search",
    query,
    title: query,
    videoId: "",
    url: fallbackUrl,
    mobileUrl: fallbackUrl,
    playerUrl: fallbackUrl,
    mobileLabel: "YouTube",
    autoOpen: true,
    reason: lastReason,
    release: NUBO_RELEASE,
    build: "youtube-canonical-external-app-v46",
    message: `精確影片解析未完成，改由YouTube App搜尋並播放：${query}`,
  });
}
