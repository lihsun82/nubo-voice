import { NextResponse } from "next/server";
import { z } from "zod";
import { createGmailDraft } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "草稿資料不完整" }, { status: 400 });
  }
  try {
    const draft = await createGmailDraft(parsed.data.to, parsed.data.subject, parsed.data.body);
    return NextResponse.json({ ok: true, draft });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "建立Gmail草稿失敗" },
      { status: 500 },
    );
  }
}
