import { NextResponse } from "next/server";
import {
  searchYouTubeVideo,
  YouTubeApiError,
  youtubeErrorSuggestion,
} from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = Boolean(process.env.YOUTUBE_API_KEY?.trim());

  if (!configured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      reason: "missing_key",
      message: "YOUTUBE_API_KEY 尚未設定",
      suggestion: youtubeErrorSuggestion("missing_key"),
    });
  }

  try {
    const result = await searchYouTubeVideo("NUBO test");
    return NextResponse.json({
      ok: true,
      configured: true,
      apiReachable: true,
      message: "YouTube Data API v3連線正常",
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
      });
    }

    return NextResponse.json({
      ok: false,
      configured: true,
      apiReachable: false,
      reason: "unknown",
      message: error instanceof Error ? error.message : "YouTube診斷失敗",
      suggestion: youtubeErrorSuggestion("unknown"),
    });
  }
}
