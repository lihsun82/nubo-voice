import { NextResponse } from "next/server";
import { z } from "zod";
import { searchYouTubeVideo } from "@/lib/youtube";

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

  try {
    return NextResponse.json({
      ok: true,
      ...(await searchYouTubeVideo(parsed.data.query)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "YouTube搜尋失敗";
    const status = message.includes("YOUTUBE_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
