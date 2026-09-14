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
const recentAlerts = new Map<string, number>();

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
  if (/^(?:(?:我要|我想|我要來|想要|需要)?(?:客訴|投訴|抱怨|反映|反應))$/u.test(normalized)) {
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
  for (const [key, at] of recentAlerts.entries()) {
    if (now - at > DUPLICATE_WINDOW_MS * 2) recentAlerts.delete(key);
  }
}

function wasRecentlyDelivered(key: string, now: number) {
  cleanupRecentAlerts(now);
  const previous = recentAlerts.get(key) ?? 0;
  return now - previous < DUPLICATE_WINDOW_MS;
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
    const isComplaint =
      body.complaint === true ||
      (classification.matched && classification.category === "complaint");

    if (isComplaint && (!roomNumber || !surname || !isSubstantiveIssue(issue))) {
      const missingFields = [
        !roomNumber ? "房號" : "",
        !surname ? "姓氏" : "",
        !isSubstantiveIssue(issue) ? "客訴內容" : "",
      ].filter(Boolean);

      return NextResponse.json(
        {
          ok: false,
          sent: false,
          complaint: true,
          missingFields,
          error: `客訴資料尚未完整，請先補齊：${missingFields.join("、")}。`,
        },
        { status: 409 },
      );
    }

    const categoryLabel = isComplaint
      ? "客訴/抱怨"
      : classification.matched
        ? getNuboGuestServiceCategoryLabel(classification.category)
        : "客人需求";
    const urgency = isComplaint ? "high" : classification.urgency;
    const urgencyLabel =
      urgency === "critical" ? "緊急" : urgency === "high" ? "優先" : "一般";
    const urgencyIcon =
      urgency === "critical" ? "🚨" : urgency === "high" ? "⚠️" : "🛎️";

    const fingerprint = [roomNumber || "unknown-room", categoryLabel, surname, issue]
      .map(normalize)
      .join(":");
    const now = Date.now();

    if (wasRecentlyDelivered(fingerprint, now)) {
      return NextResponse.json({
        ok: true,
        sent: false,
        duplicate: true,
        channel: "line",
        source,
      });
    }

    const lineText = [
      `${urgencyIcon} NUBO 即時客務通知`,
      `時間：${getTaipeiTime()}（Asia/Taipei）`,
      `類型：${categoryLabel}`,
      `優先級：${urgencyLabel}`,
      `房號：${roomNumber || "未提供"}`,
      surname ? `客人姓氏：${surname}` : "",
      !isComplaint && contact ? `聯絡方式：${contact}` : "",
      "",
      isComplaint ? "客訴內容：" : "旅客需求：",
      issue,
      "",
      "請現場人員確認並處理。",
    ]
      .filter((line) => line !== "")
      .join("\n");

    const lineResult = await pushHotelLineText(lineText);
    recentAlerts.set(fingerprint, Date.now());

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
          urgency === "critical"
            ? `【NUBO緊急客務】${roomNumber}房｜${surname}姓｜${categoryLabel}`
            : `【NUBO客務通知】${roomNumber}房｜${surname}姓｜${categoryLabel}`;
        await sendGmailMessage(
          recipients.join(", "),
          subject,
          [
            "NUBO 客務通知（LINE 已先行送達）。",
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
      channel: "line",
      line: lineResult,
      emailSent,
      emailError,
      complaint: isComplaint,
      surname: surname || null,
      roomNumber: roomNumber || null,
      contact: contact || null,
      issue,
      category: isComplaint
        ? "complaint"
        : classification.matched
          ? classification.category
          : "guest_request",
      urgency,
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
