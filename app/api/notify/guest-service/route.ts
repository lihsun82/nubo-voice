import { NextRequest, NextResponse } from "next/server";
import { sendGmailMessage } from "@/lib/gmail";
import { pushHotelLineText } from "@/lib/nubo-hotel-line";
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
const recentAlerts = new Map<string, { at: number; channel: "telegram" | "line" }>();

const NON_SUBSTANTIVE_ISSUE_PATTERNS = [
  /^尚未提供(?:客訴|抱怨|需求|內容)?$/u,
  /^尚未提供客訴內容$/u,
  /^尚未提供需求內容$/u,
  /^未提供(?:客訴|抱怨|需求|內容)?$/u,
  /^沒有提供(?:客訴|抱怨|需求|內容)?$/u,
  /^待補(?:充)?$/u,
  /^待確認$/u,
  /^不知道$/u,
  /^沒有$/u,
  /^無$/u,
  /^n\/?a$/iu,
];

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

function isSubstantiveIssue(value: string) {
  const normalized = normalize(value);
  if (!normalized) return false;
  if (NON_SUBSTANTIVE_ISSUE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return normalized.length >= 2 && /[\p{L}\p{N}]/u.test(normalized);
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
  for (const [key, { at }] of recentAlerts.entries()) {
    if (now - at > DUPLICATE_WINDOW_MS * 2) recentAlerts.delete(key);
  }
}

function getRecentDelivery(key: string, now: number) {
  cleanupRecentAlerts(now);
  const previous = recentAlerts.get(key);
  return previous && now - previous.at < DUPLICATE_WINDOW_MS ? previous : undefined;
}

async function sendGuestAlert(text: string) {
  const token = process.env.NUBO_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.NUBO_TELEGRAM_CHAT_ID?.trim();

  if (token && chatId) {
    try {
      const telegramText = text.length <= 4096 ? text : `${text.slice(0, 4000)}\n（內容過長，已截斷）`;
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: telegramText }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      });
      const result = await response.json();
      if (response.ok && result?.ok === true) {
        return { channel: "telegram" as const };
      }
      console.warn("[notify/guest-service] Telegram rejected the alert", { status: response.status });
    } catch {
      // Fetch errors can include the request URL, which contains the bot token.
      console.warn("[notify/guest-service] Telegram delivery could not be confirmed");
    }
  }

  const line = await pushHotelLineText(text);
  return { channel: "line" as const, line };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const surname = clean(body.surname);
    const roomNumber = clean(body.roomNumber ?? body.room);
    const contact = clean(body.contact);
    const issue = clean(body.issue ?? body.transcript ?? body.text);
    const source = clean(body.source) || "guest_service_alert";

    if (!isSubstantiveIssue(issue)) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          error: "客訴／需求內容尚未完整，暫不送出通知。",
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
    const urgencyIcon =
      classification.urgency === "critical"
        ? "🚨"
        : classification.urgency === "high"
          ? "⚠️"
          : "🛎️";

    const fingerprint = [roomNumber || "unknown-room", categoryLabel, issue]
      .map(normalize)
      .join(":");
    const now = Date.now();

    const recentDelivery = getRecentDelivery(fingerprint, now);
    if (recentDelivery) {
      return NextResponse.json({
        ok: true,
        sent: false,
        duplicate: true,
        channel: recentDelivery.channel,
        source,
      });
    }

    const alertText = [
      `${urgencyIcon} NUBO 即時客務通知`,
      `時間：${getTaipeiTime()}（Asia/Taipei）`,
      `類型：${categoryLabel}`,
      `優先級：${urgencyLabel}`,
      `房號：${roomNumber || "未提供"}`,
      surname ? `客人姓氏：${surname}` : "",
      contact ? `聯絡方式：${contact}` : "",
      "",
      "旅客需求／客訴：",
      issue,
      "",
      "請現場人員確認並處理。",
    ]
      .filter((line) => line !== "")
      .join("\n");

    const delivery = await sendGuestAlert(alertText);
    recentAlerts.set(fingerprint, { at: Date.now(), channel: delivery.channel });

    // An optional email copy cannot block the operational alert.
    let emailSent = false;
    let emailError: string | null = null;
    if (
      process.env.NUBO_GUEST_ALERT_EMAIL_COPY?.trim().toLowerCase() === "true" &&
      surname &&
      roomNumber &&
      contact
    ) {
      try {
        const recipients = getAlertRecipients();
        const subject =
          classification.urgency === "critical"
            ? `【NUBO緊急客務】${roomNumber}房｜${surname}姓｜${categoryLabel}`
            : `【NUBO客務通知】${roomNumber}房｜${surname}姓｜${categoryLabel}`;
        await sendGmailMessage(
          recipients.join(", "),
          subject,
          [
            "NUBO 客務通知（即時通知已送達）。",
            `時間：${getTaipeiTime()}（Asia/Taipei）`,
            `房號：${roomNumber}`,
            `客人姓氏：${surname}`,
            `聯絡方式：${contact}`,
            `類型：${categoryLabel}`,
            `優先級：${urgencyLabel}`,
            "",
            issue,
          ].join("\n"),
        );
        emailSent = true;
      } catch (error) {
        emailError = error instanceof Error ? error.message : String(error);
        console.warn("[notify/guest-service] optional email copy failed", error);
      }
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      ...delivery,
      emailSent,
      emailError,
      surname: surname || null,
      roomNumber: roomNumber || null,
      contact: contact || null,
      issue,
      category: classification.matched ? classification.category : "guest_request",
      urgency: classification.urgency,
      source,
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
