import { createHmac, timingSafeEqual } from "node:crypto";

const LINE_API_BASE = "https://api.line.me";
const LINE_TEXT_LIMIT = 4500;

function requireEnv(name: "LINE_CHANNEL_SECRET" | "LINE_CHANNEL_ACCESS_TOKEN") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 尚未設定`);
  return value;
}

export function getAllowedLineUserIds(): string[] {
  return (process.env.LINE_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isLineUserAllowed(userId: string): boolean {
  return getAllowedLineUserIds().includes(userId);
}

export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const channelSecret = requireEnv("LINE_CHANNEL_SECRET");
  const expected = createHmac("sha256", channelSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function normalizeLineText(text: string): string {
  const value = text.trim() || "NUBO已完成，但沒有可顯示的文字結果。";
  return value.length <= LINE_TEXT_LIMIT
    ? value
    : `${value.slice(0, LINE_TEXT_LIMIT - 40)}\n\n（內容過長，已截斷）`;
}

async function lineApiRequest(path: string, body: unknown) {
  const accessToken = requireEnv("LINE_CHANNEL_ACCESS_TOKEN");
  const response = await fetch(`${LINE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      payload?.message ?? `LINE Messaging API 錯誤：${response.status}`,
    );
  }
}

export async function replyLineText(replyToken: string, text: string) {
  await lineApiRequest("/v2/bot/message/reply", {
    replyToken,
    messages: [{ type: "text", text: normalizeLineText(text) }],
  });
}

export async function pushLineText(userId: string, text: string) {
  await lineApiRequest("/v2/bot/message/push", {
    to: userId,
    messages: [{ type: "text", text: normalizeLineText(text) }],
  });
}

export function getLineRemoteConfigStatus() {
  const allowedUsers = getAllowedLineUserIds();
  return {
    channelSecretConfigured: Boolean(process.env.LINE_CHANNEL_SECRET?.trim()),
    accessTokenConfigured: Boolean(
      process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim(),
    ),
    allowedUserCount: allowedUsers.length,
    internalUrl:
      process.env.NUBO_INTERNAL_URL?.trim() || "依Webhook來源自動判斷",
  };
}
