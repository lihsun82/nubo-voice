import { NextResponse } from "next/server";
import { z } from "zod";
import { openWebsite, resolveWebsite } from "@/lib/desktop-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  target: z.string().min(1).max(500),
  clientMode: z.enum(["current_browser"]).optional(),
});

function isMobileOrTouchRequest(request: Request) {
  const userAgent = request.headers.get("user-agent") ?? "";
  const mobileHint = request.headers.get("sec-ch-ua-mobile") ?? "";
  return (
    mobileHint === "?1" ||
    /Android|iPhone|iPad|iPod|Mobile|IEMobile|BlackBerry|Opera Mini/i.test(userAgent)
  );
}

function currentBrowserResponse(target: string) {
  const url = resolveWebsite(target);
  return NextResponse.json({
    ok: true,
    opened: false,
    url,
    clientAction: "open_url",
    message: "已準備在目前裝置開啟網頁",
  });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少要開啟的網站" }, { status: 400 });
  }

  try {
    if (parsed.data.clientMode === "current_browser" || isMobileOrTouchRequest(request)) {
      return currentBrowserResponse(parsed.data.target);
    }

    return NextResponse.json({
      ok: true,
      ...openWebsite(parsed.data.target),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "開啟網頁失敗" },
      { status: 500 },
    );
  }
}
