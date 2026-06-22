import { NextResponse } from "next/server";
import { z } from "zod";
import { openWebsite } from "@/lib/desktop-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  target: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少要開啟的網站" }, { status: 400 });
  }

  try {
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
