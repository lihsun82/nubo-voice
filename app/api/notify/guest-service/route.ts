import { NextRequest, NextResponse } from "next/server";
import { sendGmailMessage } from "@/lib/gmail";
import {
  classifyNuboGuestServiceTranscript,
  getNuboGuestServiceCategoryLabel,
} from "@/lib/nubo-guest-service-alert";

export const runtime = "nodejs";

const DEFAULT_ALERT_EMAIL = "lihsun82@gmail.com";
const DUPLICATE_WINDOW_MS = 90_000;
const recentAlerts = new Map<string, number>();

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[，。！？、,.!?]/g, "");
}

function getTaipeiTime() {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function cleanupRecentAlerts(now: number) {
  for (const [key, at] of recentAlerts.entries()) {
    if (now - at > DUPLICATE_WINDOW_MS * 2) {
      recentAlerts.delete(key);
    }
  }
}

function isDuplicate(key: string, now: number) {
  cleanupRecentAlerts(now);
  const previous = recentAlerts.get(key) ?? 0;
  if (now - previous < DUPLICATE_WINDOW_MS) return true;
  recentAlerts.set(key, now);
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const transcript = String(body.transcript || body.text || "").trim();

    if (!transcript) {
      return NextResponse.json(
        { ok: false, error: "Missing transcript." },
        { status: 400 },
      );
    }

    const classification = classifyNuboGuestServiceTranscript(transcript);
    if (!classification.matched) {
      return NextResponse.json({
        ok: true,
        notified: false,
        reason: "Not a guest-service request or complaint.",
      });
    }

    const fingerprint = `${classification.category}:${normalize(transcript)}`;
    const now = Date.now();
    if (isDuplicate(fingerprint, now)) {
      return NextResponse.json({
        ok: true,
        notified: false,
        duplicate: true,
        category: classification.category,
      });
    }

    const recipient =
      process.env.NUBO_GUEST_ALERT_EMAIL?.trim() || DEFAULT_ALERT_EMAIL;
    const categoryLabel = getNuboGuestServiceCategoryLabel(
      classification.category,
    );
    const urgencyLabel =
      classification.urgency === "critical"
        ? "緊急"
        : classification.urgency === "high"
          ? "優先"
          : "一般";

    const subject =
      classification.urgency === "critical"
        ? `【NUBO緊急客務】${categoryLabel}`
        : `【NUBO客務通知】${categoryLabel}`;

    const emailBody = [
      "NUBO 偵測到客人需求／客訴，請安排人員處理。",
      "",
      `時間：${getTaipeiTime()}（Asia/Taipei）`,
      `類型：${categoryLabel}`,
      `優先級：${urgencyLabel}`,
      classification.matchedKeywords.length
        ? `判定關鍵：${classification.matchedKeywords.join("、")}`
        : "",
      "",
      "客人原話：",
      transcript,
      "",
      "此信由 AinuboX1 / NUBO 客務升級機制自動寄送。",
    ]
      .filter((line) => line !== "")
      .join("\n");

    await sendGmailMessage(recipient, subject, emailBody);

    return NextResponse.json({
      ok: true,
      notified: true,
      recipient,
      category: classification.category,
      urgency: classification.urgency,
    });
  } catch (error) {
    console.error("[notify/guest-service] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
