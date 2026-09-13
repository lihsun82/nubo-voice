import { NextResponse } from "next/server";
import { z } from "zod";
import { closeDesktopApp, openDesktopApp } from "@/lib/desktop-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  app: z.string().min(1).max(100),
  action: z.enum(["open", "close"]).default("open"),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少Windows工具參數" }, { status: 400 });
  }

  try {
    if (parsed.data.action === "close") {
      const result = await closeDesktopApp(parsed.data.app);
      return NextResponse.json({
        ok: true,
        ...result,
        message:
          result.closed > 0
            ? `已送出${result.app}視窗關閉請求：${result.closed}個視窗`
            : `沒有找到${result.app}視窗`,
      });
    }

    return NextResponse.json({
      ok: true,
      ...openDesktopApp(parsed.data.app),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Windows工具操作失敗" },
      { status: 500 },
    );
  }
}
