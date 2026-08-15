import { NextResponse } from "next/server";
import { z } from "zod";
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

  // V47 clean-room YouTube path:
  // one resolver only; exact lookup is optional and can never block app launch.
  const result = await resolveCleanYouTubeV47(parsed.data.query);
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
