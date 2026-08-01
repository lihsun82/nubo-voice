import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGETS: Record<string, string> = {
  facebook: "https://m.facebook.com/",
  fb: "https://m.facebook.com/",
  instagram: "https://www.instagram.com/",
  ig: "https://www.instagram.com/",
  youtube: "https://www.youtube.com/",
  yt: "https://www.youtube.com/",
  gmail: "https://mail.google.com/",
  google: "https://www.google.com/",
  maps: "https://www.google.com/maps/",
  line: "https://line.me/R/nv/chat",
};

function resolveDestination(request: NextRequest) {
  const target = (
    request.nextUrl.searchParams.get("target") ||
    ""
  )
    .trim()
    .toLowerCase();

  if (TARGETS[target]) {
    return TARGETS[target];
  }

  const rawUrl = (
    request.nextUrl.searchParams.get("url") ||
    ""
  ).trim();

  if (!rawUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    if (parsed.hostname === "www.facebook.com") {
      parsed.hostname = "m.facebook.com";
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function GET(request: NextRequest) {
  const destination = resolveDestination(request);

  if (!destination) {
    return NextResponse.json(
      { error: "缺少或無效的外部網址" },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const response = NextResponse.redirect(destination, 302);
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate",
  );
  response.headers.set(
    "X-NUBO-Open-Mode",
    "same-origin-redirect",
  );

  return response;
}
