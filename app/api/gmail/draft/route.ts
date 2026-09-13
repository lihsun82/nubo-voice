import { NextResponse } from "next/server";
import { z } from "zod";
import { createGmailDraft } from "@/lib/gmail";
import { getGoogleConnectionStatus } from "@/lib/google-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  to: z.string().min(1).max(300),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
});

async function resolveRecipient(to: string) {
  const key = to.trim().toLowerCase().replace(/\s+/g, "");
  if (["me", "self", "mygmail", "我的gmail", "我的google信箱", "自己"].includes(key)) {
    const status = await getGoogleConnectionStatus();
    if (!status.email) throw new Error("Gmail尚未完成OAuth連接，無法取得你的Google信箱");
    return status.email;
  }
  return to.trim();
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "草稿資料不完整" }, { status: 400 });
  }
  try {
    const to = await resolveRecipient(parsed.data.to);
    const draft = await createGmailDraft(to, parsed.data.subject, parsed.data.body);
    return NextResponse.json({ ok: true, draft, to });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "建立Gmail草稿失敗" },
      { status: 500 },
    );
  }
}
