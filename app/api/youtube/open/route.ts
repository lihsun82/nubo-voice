import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { z } from "zod";
import { searchYouTubeVideo } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  query: z.string().min(1).max(300),
  service: z.enum(["youtube", "youtube_music"]).default("youtube_music"),
});

function browserCandidates(): string[] {
  return [
    process.env.LOCALAPPDATA
      ? path.join(
          process.env.LOCALAPPDATA,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : "",
    process.env.PROGRAMFILES
      ? path.join(
          process.env.PROGRAMFILES,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : "",
    process.env["PROGRAMFILES(X86)"]
      ? path.join(
          process.env["PROGRAMFILES(X86)"] as string,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : "",
    process.env.PROGRAMFILES
      ? path.join(
          process.env.PROGRAMFILES,
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        )
      : "",
    process.env["PROGRAMFILES(X86)"]
      ? path.join(
          process.env["PROGRAMFILES(X86)"] as string,
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe",
        )
      : "",
  ].filter(Boolean);
}

function openDedicatedPlayer(url: string): {
  opened: boolean;
  browser: string | null;
  autoplayMode: boolean;
} {
  if (process.platform !== "win32") {
    return { opened: false, browser: null, autoplayMode: false };
  }

  const browser = browserCandidates().find((candidate) => existsSync(candidate));
  if (browser) {
    const profileDir = path.join(
      process.cwd(),
      "data",
      "youtube-autoplay-profile",
    );
    mkdirSync(profileDir, { recursive: true });
    const child = spawn(
      browser,
      [
        `--user-data-dir=${profileDir}`,
        "--no-first-run",
        "--disable-session-crashed-bubble",
        "--autoplay-policy=no-user-gesture-required",
        `--app=${url}`,
      ],
      {
        detached: true,
        windowsHide: true,
        stdio: "ignore",
      },
    );
    child.unref();
    return {
      opened: true,
      browser: path.basename(browser),
      autoplayMode: true,
    };
  }

  try {
    const child = spawn(
      "rundll32.exe",
      ["url.dll,FileProtocolHandler", url],
      {
        detached: true,
        windowsHide: true,
        stdio: "ignore",
      },
    );
    child.unref();
    return { opened: true, browser: "default", autoplayMode: false };
  } catch {
    return { opened: false, browser: null, autoplayMode: false };
  }
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少歌曲或影片名稱" }, { status: 400 });
  }

  try {
    const result = await searchYouTubeVideo(parsed.data.query);
    const baseUrl = process.env.NUBO_PUBLIC_URL ?? "http://127.0.0.1:3000";
    const playerUrl = new URL("/youtube-player", baseUrl);
    playerUrl.searchParams.set("videoId", result.videoId);
    playerUrl.searchParams.set("title", result.title);
    playerUrl.searchParams.set("channel", result.channelTitle);

    const launch = openDedicatedPlayer(playerUrl.toString());
    return NextResponse.json({
      ok: true,
      ...result,
      playerUrl: playerUrl.toString(),
      ...launch,
      message: launch.autoplayMode
        ? `已開啟並自動播放：${result.title}`
        : launch.opened
          ? `已開啟播放器，但瀏覽器可能要求第一次手動按播放：${result.title}`
          : `無法自動開啟瀏覽器，請使用playerUrl播放：${result.title}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "YouTube播放失敗";
    const status = message.includes("YOUTUBE_API_KEY") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
