import { NextRequest, NextResponse } from "next/server";
import {
  buildNameCalledMessage,
  pushLineTextMessage,
} from "@/lib/line-push-notify";

export const runtime = "nodejs";

let lastNotifyAt = 0;

function getCooldownMs(): number {
  const raw = process.env.NUBO_NAME_ALERT_COOLDOWN_SECONDS || "60";
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 5) return 60_000;
  return seconds * 1000;
}

function getKeywords(): string[] {
  const raw =
    process.env.NUBO_NAME_ALERT_KEYWORDS || "李政勲,政勲,Leo,老闆,兄弟";

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function findMatchedKeyword(text: string): string | null {
  const normalized = text.toLowerCase();

  for (const keyword of getKeywords()) {
    if (normalized.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    if (process.env.NUBO_NAME_ALERT_ENABLED !== "true") {
      return NextResponse.json({
        ok: false,
        skipped: true,
        reason: "NUBO_NAME_ALERT_ENABLED is not true.",
      });
    }

    const body = await req.json().catch(() => ({}));
    const transcript = String(body.transcript || body.text || "").trim();

    if (!transcript) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing transcript.",
        },
        { status: 400 }
      );
    }

    const matchedKeyword = findMatchedKeyword(transcript);

    if (!matchedKeyword) {
      return NextResponse.json({
        ok: true,
        notified: false,
        reason: "No keyword matched.",
      });
    }

    const now = Date.now();
    const cooldownMs = getCooldownMs();

    if (now - lastNotifyAt < cooldownMs) {
      return NextResponse.json({
        ok: true,
        notified: false,
        reason: "Cooldown active.",
        matchedKeyword,
      });
    }

    lastNotifyAt = now;

    const message = buildNameCalledMessage(matchedKeyword, transcript);
    await pushLineTextMessage(message);

    return NextResponse.json({
      ok: true,
      notified: true,
      matchedKeyword,
    });
  } catch (error) {
    console.error("[notify/name-called] failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}