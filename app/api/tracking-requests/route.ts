import { NextResponse } from "next/server";
import { z } from "zod";
import { saveTrackingRequest } from "@/lib/tracking-store";

export const runtime = "nodejs";

const requestSchema = z.object({
  title: z.string().min(2).max(100),
  target: z.string().min(2).max(500),
  frequency: z.enum(["hourly", "daily", "custom"]),
  customSchedule: z.string().max(200).nullable(),
  notifyWhen: z.string().min(2).max(500),
});

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "追蹤條件格式不完整", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const trackingRequest = await saveTrackingRequest(parsed.data);
    return NextResponse.json({
      ok: true,
      message: "已建立追蹤需求草稿，尚未啟動正式排程。",
      trackingRequest,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "追蹤需求儲存失敗" }, { status: 500 });
  }
}
