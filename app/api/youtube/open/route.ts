import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveYouTubeAppVideoV46 } from "@/lib/youtube-app-resolver-v46";
import { resolveCleanYouTubeV47 } from "@/lib/youtube-clean-v47";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  query: z.string().min(1).max(300),
  service: z.enum(["youtube", "youtube_music"]).default("youtube"),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少歌曲或影片名稱" }, { status: 400 });
  }

  const query = parsed.data.query.trim();

  // V49: external YouTube App playback prefers a real videoId from the
  // YouTube Data API. This is the only path that can reliably hand Android a
  // watch URL that starts the requested video instead of merely opening Home/Search.
  try {
    const exact = await resolveYouTubeAppVideoV46(query);
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(exact.videoId)}`;
    return NextResponse.json({
      ok: true,
      query,
      title: exact.title || query,
      videoId: exact.videoId,
      url: watchUrl,
      mobileUrl: watchUrl,
      playerUrl: watchUrl,
      mobileLabel: "YouTube",
      autoOpen: true,
      playbackMode: "exact-video-v49",
      fallback: false,
      release: "V49-exact-once",
      build: "youtube-exact-once-v49",
      message: `正在由 YouTube App 播放：${exact.title || query}`,
    }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch {
    // Do not block playback. If the API key/quota is unavailable, keep the V47
    // HTML resolver and finally the YouTube search URL as the last fallback.
  }

  const result = await resolveCleanYouTubeV47(query);
  return NextResponse.json({
    ...result,
    release: "V49-exact-once",
    build: "youtube-exact-once-v49",
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
