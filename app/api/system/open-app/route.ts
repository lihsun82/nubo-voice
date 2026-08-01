import { NextResponse } from "next/server";
import { z } from "zod";
import {
  closeDesktopApp,
  openDesktopApp,
} from "@/lib/desktop-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  app: z.string().min(1).max(100),
  action: z.enum(["open", "close"]).default("open"),
  query: z.string().max(300).optional(),
  value: z.string().max(300).optional(),
});

function isLocalHost(request: Request) {
  const host = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  )
    .split(":")[0]
    .trim()
    .toLowerCase();

  return [
    "localhost",
    "127.0.0.1",
    "::1",
  ].includes(host);
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function resolvePublicApp(
  appValue: string,
  queryValue?: string,
) {
  const app = normalizeKey(appValue);
  const query = (queryValue ?? "").trim();

  if (["facebook", "fb", "臉書"].includes(app)) {
    return {
      url: "https://m.facebook.com/",
      label: "Facebook",
    };
  }

  if (["instagram", "ig"].includes(app)) {
    return {
      url: "https://www.instagram.com/",
      label: "Instagram",
    };
  }

  if (["youtube", "yt", "油管"].includes(app)) {
    return {
      url: query
        ? "https://www.youtube.com/results?search_query=" +
          encodeURIComponent(query)
        : "https://www.youtube.com/",
      label: "YouTube",
    };
  }

  if (
    [
      "youtubemusic",
      "ytmusic",
      "youtube音樂",
    ].includes(app)
  ) {
    return {
      url: query
        ? "https://music.youtube.com/search?q=" +
          encodeURIComponent(query)
        : "https://music.youtube.com/",
      label: "YouTube Music",
    };
  }

  if (["gmail", "googlemail"].includes(app)) {
    return {
      url: "https://mail.google.com/",
      label: "Gmail",
    };
  }

  if (
    [
      "maps",
      "googlemaps",
      "地圖",
      "google地圖",
    ].includes(app)
  ) {
    return {
      url: query
        ? "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(query)
        : "https://www.google.com/maps/",
      label: "Google Maps",
    };
  }

  if (
    [
      "google",
      "chrome",
      "browser",
      "瀏覽器",
    ].includes(app)
  ) {
    return {
      url: query
        ? "https://www.google.com/search?q=" +
          encodeURIComponent(query)
        : "https://www.google.com/",
      label: "Google",
    };
  }

  if (["line", "賴"].includes(app)) {
    return {
      url: "https://line.me/R/nv/chat",
      label: "LINE",
    };
  }

  return null;
}

function buildRelayUrl(
  request: Request,
  destination: string,
) {
  const relay = new URL("/open", request.url);
  relay.searchParams.set("url", destination);
  relay.searchParams.set("ts", String(Date.now()));
  return relay.toString();
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "缺少工具參數" },
      { status: 400 },
    );
  }

  const publicWeb =
    !isLocalHost(request) ||
    process.platform !== "win32";

  try {
    if (parsed.data.action === "close") {
      if (publicWeb) {
        return NextResponse.json(
          {
            error:
              "手機或公開網頁無法直接關閉其他App。",
            publicWeb: true,
          },
          { status: 409 },
        );
      }

      const result = await closeDesktopApp(
        parsed.data.app,
      );

      return NextResponse.json({
        ok: true,
        ...result,
        message:
          result.closed > 0
            ? `已送出${result.app}視窗關閉請求：${result.closed}個視窗`
            : `沒有找到${result.app}視窗`,
      });
    }

    if (publicWeb) {
      const destination = resolvePublicApp(
        parsed.data.app,
        parsed.data.query,
      );

      if (destination) {
        const relayUrl = buildRelayUrl(
          request,
          destination.url,
        );

        return NextResponse.json(
          {
            ok: true,
            mobileUrl: relayUrl,
            finalUrl: destination.url,
            mobileLabel: destination.label,
            autoOpen: true,
            publicWeb: true,
            executionTarget: "client-browser",
            navigationMode: "same-origin-redirect",
          },
          {
            headers: {
              "Cache-Control": "no-store",
              "X-NUBO-Open-Mode":
                "same-origin-redirect",
            },
          },
        );
      }

      return NextResponse.json(
        {
          error:
            "目前是手機或公開網頁模式。請使用開啟網站功能。",
          publicWeb: true,
          actualPlatform: "web-browser",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      ...openDesktopApp(parsed.data.app),
      executionTarget: "local-windows",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "工具操作失敗",
      },
      { status: 500 },
    );
  }
}
