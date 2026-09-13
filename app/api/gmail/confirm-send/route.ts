import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmEmailSend } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  pendingId:
    z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "郵件確認資料格式錯誤",
      },
      { status: 400 },
    );
  }
  try {
    const sent = await confirmEmailSend(parsed.data.pendingId);
    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "寄送郵件失敗" },
      { status: 500 },
    );
  }
}
