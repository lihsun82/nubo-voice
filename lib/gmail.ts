import path from "node:path";
import { readJson, writeJson } from "@/lib/json-store";
import { googleApiFetch } from "@/lib/google-auth";

const pendingFile = path.join(process.cwd(), "data", "pending-email-actions.json");

export type GmailMessageSummary = {
  id: string;
  threadId?: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  labels: string[];
};

export type GmailMessage = GmailMessageSummary & {
  to: string;
  cc: string;
  body: string;
};

type PendingEmail = {
  id: string;
  to: string;
  subject: string;
  body: string;
  createdAt: string;
  expiresAt: string;
  sentAt?: string;
};

type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string };
  parts?: GmailPart[];
};

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function header(part: GmailPart | undefined, name: string): string {
  const value = part?.headers?.find(
    (item) => item.name?.toLowerCase() === name.toLowerCase(),
  )?.value;
  return value ?? "";
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBody(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data).trim();
  }
  if (Array.isArray(part.parts)) {
    for (const child of part.parts) {
      const text = extractBody(child);
      if (text) return text;
    }
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return stripHtml(decodeBase64Url(part.body.data));
  }
  if (part.body?.data) return decodeBase64Url(part.body.data).trim();
  return "";
}

async function gmailJson(url: string, init: RequestInit = {}) {
  const response = await googleApiFetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Gmail API錯誤：${response.status}`);
  }
  return payload;
}

export async function searchGmail(
  query: string,
  maxResults = 10,
): Promise<GmailMessageSummary[]> {
  const params = new URLSearchParams({
    q: query,
    maxResults: String(Math.max(1, Math.min(20, maxResults))),
  });
  const list = await gmailJson(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
  );
  const items = Array.isArray(list?.messages) ? list.messages : [];

  const results: GmailMessageSummary[] = [];
  for (const item of items) {
    if (typeof item?.id !== "string") continue;
    const metadataParams = new URLSearchParams({ format: "metadata" });
    for (const name of ["Subject", "From", "Date"]) {
      metadataParams.append("metadataHeaders", name);
    }
    const message = await gmailJson(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?${metadataParams.toString()}`,
    );
    results.push({
      id: item.id,
      threadId: message.threadId,
      subject: header(message.payload, "Subject") || "（無主旨）",
      from: header(message.payload, "From") || "未知寄件者",
      date: header(message.payload, "Date"),
      snippet: typeof message.snippet === "string" ? message.snippet : "",
      labels: Array.isArray(message.labelIds) ? message.labelIds : [],
    });
  }
  return results;
}

export async function readGmailMessage(id: string): Promise<GmailMessage> {
  const message = await gmailJson(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
  );
  return {
    id,
    threadId: message.threadId,
    subject: header(message.payload, "Subject") || "（無主旨）",
    from: header(message.payload, "From") || "未知寄件者",
    to: header(message.payload, "To"),
    cc: header(message.payload, "Cc"),
    date: header(message.payload, "Date"),
    snippet: typeof message.snippet === "string" ? message.snippet : "",
    labels: Array.isArray(message.labelIds) ? message.labelIds : [],
    body: extractBody(message.payload),
  };
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildRawEmail(to: string, subject: string, body: string): string {
  const body64 = Buffer.from(body, "utf8").toString("base64");
  const mime = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    body64,
  ].join("\r\n");
  return encodeBase64Url(mime);
}

export async function createGmailDraft(to: string, subject: string, body: string) {
  return gmailJson("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    body: JSON.stringify({ message: { raw: buildRawEmail(to, subject, body) } }),
  });
}

export async function sendGmailMessage(to: string, subject: string, body: string) {
  return gmailJson("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw: buildRawEmail(to, subject, body) }),
  });
}

export async function prepareEmailSend(
  to: string,
  subject: string,
  body: string,
): Promise<PendingEmail> {
  const items = await readJson<PendingEmail[]>(pendingFile, []);
  const pending: PendingEmail = {
    id: crypto.randomUUID(),
    to,
    subject,
    body,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
  items.push(pending);
  await writeJson(pendingFile, items.slice(-100));
  return pending;
}

export async function confirmEmailSend(id: string) {
  const items = await readJson<PendingEmail[]>(pendingFile, []);
  const pending = items.find((item) => item.id === id);
  if (!pending) throw new Error("找不到待確認郵件");
  if (pending.sentAt) throw new Error("這封郵件已寄出");
  if (new Date(pending.expiresAt).getTime() < Date.now()) {
    throw new Error("郵件確認已過期，請重新準備寄送");
  }
  const result = await sendGmailMessage(pending.to, pending.subject, pending.body);
  pending.sentAt = new Date().toISOString();
  await writeJson(pendingFile, items);
  return { result, email: pending };
}

export function isEmailAutosendAllowed(to: string): boolean {
  if (process.env.NUBO_EMAIL_AUTOSEND !== "true") return false;
  const allowlist = (process.env.NUBO_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(to.trim().toLowerCase());
}
