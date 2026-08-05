import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  searchYouTubeVideo,
  YouTubeApiError,
  youtubeErrorSuggestion,
} from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NUBO_RELEASE = "V15.6.23";

const schema = z.object({
  query: z.string().min(1).max(300),
  service: z.enum(["youtube", "youtube_music"]).default("youtube"),
});

function browserCandidates(): string[] {
  return [
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : "",
    process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe")
      : "",
    process.env["PROGRAMFILES(X86)"]
      ? path.join(process.env["PROGRAMFILES(X86)"] as string, "Google", "Chrome", "Application", "chrome.exe")
      : "",
    process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe")
      : "",
    process.env["PROGRAMFILES(X86)"]
      ? path.join(process.env["PROGRAMFILES(X86)"] as string, "Microsoft", "Edge", "Application", "msedge.exe")
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
    const profileDir = path.join(process.cwd(), "data", "youtube-autoplay-profile");
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
      { detached: true, windowsHide: true, stdio: "ignore" },
    );
    child.unref();
    return { opened: true, browser: path.basename(browser), autoplayMode: true };
  }

  try {
    const child = spawn(
      "rundll32.exe",
      ["url.dll,FileProtocolHandler", url],
      { detached: true, windowsHide: true, stdio: "ignore" },
    );
    child.unref();
    return { opened: true, browser: "default", autoplayMode: false };
  } catch {
    return { opened: false, browser: null, autoplayMode: false };
  }
}

function resolvePlayerBaseUrl(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const configured = process.env.NUBO_PUBLIC_URL?.trim();

  if (!configured) return requestOrigin;

  try {
    const configuredUrl = new URL(configured);
    const isLocal = ["127.0.0.1", "localhost"].includes(configuredUrl.hostname);
    return isLocal ? requestOrigin : configuredUrl.origin;
  } catch {
    return requestOrigin;
  }
}

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
    const result = await searchYouTubeVideo(query);
    const playerUrl = new URL("/youtube-player", resolvePlayerBaseUrl(request));
    playerUrl.searchParams.set("videoId", result.videoId);
    playerUrl.searchParams.set("title", result.title);
    playerUrl.searchParams.set("channel", result.channelTitle);

    const launch = openDedicatedPlayer(playerUrl.toString());
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(result.videoId)}&autoplay=1`;

    return NextResponse.json({
      ok: true,
      ...result,
      url: watchUrl,
      mobileUrl: watchUrl,
      playerUrl: playerUrl.toString(),
      ...launch,
      release: NUBO_RELEASE,
      build: "youtube-api-or-search-fallback-v5-20260806",
      message: `已找到並準備播放：${result.title}`,
    });
  } catch (error) {
    const fallbackUrl = youtubeSearchUrl(query);
    const reason = error instanceof YouTubeApiError ? error.reason : "unknown";

    // 雲端缺少 API Key、配額用完或搜尋服務異常時，不再讓播放流程中斷。
    // 回傳 200，前端會直接開啟 YouTube 搜尋結果，確保使用者一定看得到動作。
    return NextResponse.json({
      ok: true,
      fallback: true,
      query,
      url: fallbackUrl,
      mobileUrl: fallbackUrl,
      playerUrl: fallbackUrl,
      mobileLabel: "YouTube",
      reason,
      suggestion: youtubeErrorSuggestion(reason),
      release: NUBO_RELEASE,
      build: "youtube-api-or-search-fallback-v5-20260806",
      message: "YouTube精確搜尋暫時不可用，已改開YouTube搜尋結果。",
    });
  }
}
