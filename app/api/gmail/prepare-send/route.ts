import { NextResponse } from "next/server";
import { z } from "zod";
import { prepareEmailSend } from "@/lib/gmail";

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
    return NextResponse.json({ error: "郵件資料不完整" }, { status: 400 });
  }
  const pending = await prepareEmailSend(parsed.data.to, parsed.data.subject, parsed.data.body);
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
}
