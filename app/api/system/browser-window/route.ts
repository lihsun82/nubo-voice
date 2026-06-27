import { NextResponse } from "next/server";
import { z } from "zod";
import { closeBrowserWindow } from "@/lib/browser-window-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.literal("close"),
  target: z.string().min(1).max(100).default("browser"),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "瀏覽器視窗參數不完整" }, { status: 400 });
  }

  try {
    const result = await closeBrowserWindow(parsed.data.target);
    return NextResponse.json({
      ok: true,
      ...result,
      message:
        result.closed > 0
          ? `已處理${result.target}：${result.closed}個視窗`
          : `沒有找到符合的${result.target}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "瀏覽器視窗操作失敗" },
      { status: 500 },
    );
  }
}
