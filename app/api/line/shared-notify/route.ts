import { NextResponse } from "next/server";
import { z } from "zod";
import { sendLineSharedNotification } from "@/lib/line-shared-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  mode: z.enum(["multicast", "broadcast", "group"]).optional(),
  title: z.string().max(80).optional(),
  text: z.string().min(1).max(500),
  source: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "LINE 共同通知資料格式不正確",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  try {
    const result = await sendLineSharedNotification(parsed.data);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "LINE 共同通知失敗",
      },
      { status: 500 },
    );
  }
}