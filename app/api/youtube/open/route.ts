import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  query: z.string().min(1).max(300),
  service: z.enum(["youtube", "youtube_music"]).default("youtube_music"),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少歌曲或影片名稱" }, { status: 400 });
  }

  const query = encodeURIComponent(parsed.data.query);
  const url =
    parsed.data.service === "youtube_music"
      ? `https://music.youtube.com/search?q=${query}`
      : `https://www.youtube.com/results?search_query=${query}`;

  let opened = false;
  if (process.platform === "win32") {
    try {
      const child = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
        detached: true,
        windowsHide: true,
        stdio: "ignore",
      });
      child.unref();
      opened = true;
    } catch {
      opened = false;
    }
  }

  return NextResponse.json({
    ok: true,
    opened,
    url,
    message: opened ? "已在Windows開啟YouTube" : "請使用回傳連結開啟YouTube",
  });
}
