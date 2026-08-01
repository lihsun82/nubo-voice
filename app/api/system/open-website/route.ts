import { NextResponse } from "next/server";
import { z } from "zod";
import {
  openWebsite,
  resolveWebsite,
} from "@/lib/desktop-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  target: z.string().min(1).max(500),
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

function labelForUrl(url: string) {
  if (/facebook\.com/i.test(url)) return "Facebook";
  if (/instagram\.com/i.test(url)) return "Instagram";
  if (/music\.youtube\.com/i.test(url)) return "YouTube Music";
  if (/youtube\.com|youtu\.be/i.test(url)) return "YouTube";
  if (/mail\.google\.com/i.test(url)) return "Gmail";
  if (/google\.com\/maps|maps\.google\.com/i.test(url)) {
    return "Google Maps";
  }
  if (/google\.com/i.test(url)) return "Google";
  return "網頁";
}

function normalizePublicUrl(url: string) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname === "www.facebook.com") {
      parsed.hostname = "m.facebook.com";
    }

    return parsed.toString();
  } catch {
    return url;
  }
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
      { error: "缺少要開啟的網站" },
      { status: 400 },
    );
  }

  try {
    const resolvedUrl = normalizePublicUrl(
      resolveWebsite(parsed.data.target),
    );

    if (
      !isLocalHost(request) ||
      process.platform !== "win32"
    ) {
      const relayUrl = buildRelayUrl(
        request,
        resolvedUrl,
      );

      return NextResponse.json(
        {
          ok: true,
          mobileUrl: relayUrl,
          finalUrl: resolvedUrl,
          mobileLabel: labelForUrl(resolvedUrl),
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

    return NextResponse.json({
      ok: true,
      ...openWebsite(parsed.data.target),
      executionTarget: "local-windows",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "開啟網頁失敗",
      },
      { status: 500 },
    );
  }
}
