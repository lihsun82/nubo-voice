import { NextResponse } from "next/server";
import {
  getYouTubeApiKey,
  searchYouTubeVideo,
  YouTubeApiError,
  youtubeErrorSuggestion,
} from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = Boolean(getYouTubeApiKey());

  if (!configured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      reason: "missing_key",
      message: "YouTube API Key 尚未設定",
      suggestion: youtubeErrorSuggestion("missing_key"),
      mobileFallbackAvailable: true,
    });
  }

  try {
    const result = await searchYouTubeVideo("NUBO test");
    return NextResponse.json({
      ok: true,
      configured: true,
      apiReachable: true,
      message: "YouTube Data API v3連線正常",
      mobileFallbackAvailable: true,
      sample: {
        videoId: result.videoId,
        title: result.title,
        channelTitle: result.channelTitle,
      },
    });
  } catch (error) {
    if (error instanceof YouTubeApiError) {
      return NextResponse.json({
        ok: false,
        configured: true,
        apiReachable: error.reason !== "network_error",
        reason: error.reason,
        googleReason: error.googleReason,
        message: error.message,
        suggestion: youtubeErrorSuggestion(error.reason),
        mobileFallbackAvailable: true,
      });
    }

    return NextResponse.json({
      ok: false,
      configured: true,
      apiReachable: false,
      reason: "unknown",
      message: error instanceof Error ? error.message : "YouTube診斷失敗",
      suggestion: youtubeErrorSuggestion("unknown"),
      mobileFallbackAvailable: true,
    });
  }
}
