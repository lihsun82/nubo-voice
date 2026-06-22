import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  query: z.string().min(1).max(300),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少歌曲或影片名稱" }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY 尚未設定" },
      { status: 503 },
    );
  }

  const params = new URLSearchParams({
    part: "snippet",
    q: parsed.data.query,
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
    return NextResponse.json(
      {
        error:
          payload?.error?.message ??
          `YouTube Data API 錯誤：${response.status}`,
      },
      { status: response.status },
    );
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const match = items.find(
    (item: any) =>
      typeof item?.id?.videoId === "string" &&
      typeof item?.snippet?.title === "string",
  );

  if (!match) {
    return NextResponse.json(
      { error: "找不到可嵌入播放的YouTube影片" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    videoId: match.id.videoId,
    title: match.snippet.title,
    channelTitle: match.snippet.channelTitle ?? "",
    query: parsed.data.query,
    watchUrl: `https://www.youtube.com/watch?v=${match.id.videoId}`,
  });
}
