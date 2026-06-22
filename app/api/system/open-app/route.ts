import { NextResponse } from "next/server";
import { z } from "zod";
import { openDesktopApp } from "@/lib/desktop-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  app: z.string().min(1).max(100),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少要開啟的Windows工具" }, { status: 400 });
  }

  try {
    return NextResponse.json({
      ok: true,
      ...openDesktopApp(parsed.data.app),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "開啟Windows工具失敗" },
      { status: 500 },
    );
  }
}
