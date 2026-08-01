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
  if (/youtube\.com|youtu\.be/i.test(url)) return "YouTube";
  if (/music\.youtube\.com/i.test(url)) return "YouTube Music";
  if (/mail\.google\.com/i.test(url)) return "Gmail";
  if (/google\.com\/maps|maps\.google\.com/i.test(url)) return "Google Maps";
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

    /*
     * Railway 執行環境不是使用者的電腦。
     * 公開網域或非 Windows 主機不可在伺服器端呼叫 rundll32；
     * 應把網址回傳給手機／瀏覽器，由前端直接開啟。
     */
    if (!isLocalHost(request) || process.platform !== "win32") {
      return NextResponse.json(
        {
          ok: true,
          mobileUrl: resolvedUrl,
          mobileLabel: labelForUrl(resolvedUrl),
          autoOpen: true,
          publicWeb: true,
          executionTarget: "client-browser",
        },
        {
          headers: {
            "Cache-Control": "no-store",
            "X-NUBO-Open-Mode": "client-browser",
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
