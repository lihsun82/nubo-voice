import { NextResponse } from "next/server";
import { z } from "zod";
import loudness from "loudness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["set", "increase", "decrease", "mute", "unmute", "status"]),
  value: z.number().min(0).max(100).optional().default(10),
});

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "音量參數不正確" }, { status: 400 });
  }

  if (process.platform !== "win32") {
    return NextResponse.json({ error: "音量調整目前只支援Windows" }, { status: 400 });
  }

  try {
    const { action, value } = parsed.data;
    if (action === "mute") await loudness.setMuted(true);
    else if (action === "unmute") await loudness.setMuted(false);
    else if (action !== "status") {
      const current = await loudness.getVolume();
      const next =
        action === "set"
          ? clamp(value)
          : action === "increase"
            ? clamp(current + value)
            : clamp(current - value);
      await loudness.setVolume(next);
      await loudness.setMuted(false);
    }

    return NextResponse.json({
      ok: true,
      volume: await loudness.getVolume(),
      muted: await loudness.getMuted(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "音量調整失敗" },
      { status: 500 },
    );
  }
}
