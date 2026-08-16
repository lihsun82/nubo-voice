import { NextRequest, NextResponse } from "next/server";
import { sendGmailMessage } from "@/lib/gmail";
import {
  classifyNuboGuestServiceTranscript,
  getNuboGuestServiceCategoryLabel,
} from "@/lib/nubo-guest-service-alert";

export const runtime = "nodejs";

const DEFAULT_ALERT_EMAILS = [
  "lihsun82@gmail.com",
  "wangjasam@gmail.com",
  "ginatu83@gmail.com",
];
const DUPLICATE_WINDOW_MS = 180_000;
const recentAlerts = new Map<string, number>();

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[，。！？、,.!?]/g, "");
}

function getAlertRecipients() {
  const configured = (process.env.NUBO_GUEST_ALERT_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set([...DEFAULT_ALERT_EMAILS, ...configured]));
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
    if (now - at > DUPLICATE_WINDOW_MS * 2) recentAlerts.delete(key);
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
    const surname = clean(body.surname);
    const roomNumber = clean(body.roomNumber ?? body.room);
    const contact = clean(body.contact);
    const issue = clean(body.issue ?? body.transcript ?? body.text);

    const missing = [
      !surname ? "surname" : "",
      !roomNumber ? "roomNumber" : "",
      !contact ? "contact" : "",
      !issue ? "issue" : "",
    ].filter(Boolean);

    if (missing.length) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          requiresCompleteIntake: true,
          missing,
          error: "客務資料未完整，必須先取得姓氏、房號、聯絡方式與客訴/需求內容。",
        },
        { status: 400 },
      );
    }

    const classification = classifyNuboGuestServiceTranscript(issue);
    const categoryLabel = classification.matched
      ? getNuboGuestServiceCategoryLabel(classification.category)
      : "客人需求／客訴";
    const urgencyLabel =
      classification.urgency === "critical"
        ? "緊急"
        : classification.urgency === "high"
          ? "優先"
          : "一般";

    const fingerprint = [roomNumber, surname, contact, issue]
      .map(normalize)
      .join(":");
    const now = Date.now();
    const recipients = getAlertRecipients();
    const recipientHeader = recipients.join(", ");

    if (isDuplicate(fingerprint, now)) {
      return NextResponse.json({
        ok: true,
        sent: false,
        duplicate: true,
        recipients,
      });
    }

    const subject =
      classification.urgency === "critical"
        ? `【NUBO緊急客務】${roomNumber}房｜${surname}姓｜${categoryLabel}`
        : `【NUBO客務通知】${roomNumber}房｜${surname}姓｜${categoryLabel}`;

    const emailBody = [
      "NUBO 已完成客人客務資料建檔，請立即安排人員處理。",
      "",
      `時間：${getTaipeiTime()}（Asia/Taipei）`,
      `房號：${roomNumber}`,
      `客人姓氏：${surname}`,
      `聯絡方式：${contact}`,
      `類型：${categoryLabel}`,
      `優先級：${urgencyLabel}`,
      "",
      "客訴／需求內容：",
      issue,
      "",
      "此信由 AinuboX1 / NUBO 客務升級機制自動寄送。",
    ].join("\n");

    await sendGmailMessage(recipientHeader, subject, emailBody);

    return NextResponse.json({
      ok: true,
      sent: true,
      recipients,
      surname,
      roomNumber,
      contact,
      issue,
      category: classification.matched ? classification.category : "guest_request",
      urgency: classification.urgency,
    });
  } catch (error) {
    console.error("[notify/guest-service] failed", error);
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
