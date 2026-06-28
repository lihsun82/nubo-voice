import { NextResponse } from "next/server";
import { z } from "zod";
import { prepareEmailSend } from "@/lib/gmail";
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
    return NextResponse.json({ error: "郵件資料不完整" }, { status: 400 });
  }
  try {
    const to = await resolveRecipient(parsed.data.to);
    const pending = await prepareEmailSend(to, parsed.data.subject, parsed.data.body);
    return NextResponse.json({
      ok: true,
      pendingId: pending.id,
      expiresAt: pending.expiresAt,
      preview: {
        to: pending.to,
        subject: pending.subject,
        body: pending.body,
      },
      instruction: "請向使用者覆誦收件者、主旨與內容摘要，只有使用者明確說確認寄出後才能呼叫確認寄送。",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "準備寄送郵件失敗" },
      { status: 500 },
    );
  }
}
