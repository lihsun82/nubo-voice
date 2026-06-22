import { NextResponse } from "next/server";
import { z } from "zod";
import { readGmailMessage } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ id: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少郵件ID" }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, message: await readGmailMessage(parsed.data.id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "讀取郵件失敗" },
      { status: 500 },
    );
  }
}
