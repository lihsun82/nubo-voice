"use client";

import { classifyNuboGuestServiceTranscript } from "@/lib/nubo-guest-service-alert";

type GuestIntakeState = {
  active: boolean;
  startedAt: number;
  updatedAt: number;
  surname: string;
  roomNumber: string;
  contact: string;
  issueParts: string[];
};

const STORAGE_KEY = "nubo_guest_service_intake_v2";
const LAST_SENT_KEY = "nubo_guest_service_last_sent_v2";
const INTAKE_TTL_MS = 20 * 60_000;
const LOCAL_DUPLICATE_MS = 3 * 60_000;

function emptyState(): GuestIntakeState {
  const now = Date.now();
  return {
    active: false,
    startedAt: now,
    updatedAt: now,
    surname: "",
    roomNumber: "",
    contact: "",
    issueParts: [],
  };
}

function loadState(): GuestIntakeState {
  if (typeof window === "undefined") return emptyState();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as GuestIntakeState | null;
    if (!parsed || Date.now() - Number(parsed.updatedAt ?? 0) > INTAKE_TTL_MS) {
      return emptyState();
    }
    return {
      ...emptyState(),
      ...parsed,
      issueParts: Array.isArray(parsed.issueParts) ? parsed.issueParts.slice(-8) : [],
    };
  } catch {
    return emptyState();
  }
}

function saveState(state: GuestIntakeState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function compact(value: string) {
  return value.replace(/[\s　，,。.!！?？、:：;；'"“”‘’（）()【】\[\]-]+/g, "").toLowerCase();
}

function extractSurname(text: string) {
  const explicit = text.match(/(?:我姓|姓氏(?:是|為)?|姓)\s*([\p{Script=Han}])/u);
  if (explicit?.[1]) return explicit[1];
  const title = text.match(/([\p{Script=Han}])\s*(?:先生|小姐|女士)/u);
  return title?.[1] ?? "";
}

function extractRoom(text: string) {
  const patterns = [
    /(?:房號|房間|住在|住)\s*(?:是|為)?\s*([A-Za-z]?\d{2,4})\s*(?:號?房)?/iu,
    /([A-Za-z]?\d{2,4})\s*(?:號?房|房間)/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return "";
}

function normalizePhone(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  const numeric = digits.replace(/^\+/, "");
  if (numeric.length < 8 || numeric.length > 15) return "";
  return digits;
}

function extractContact(text: string) {
  const phone = text.match(/(?:\+?886[-\s]?)?0?9\d(?:[-\s]?\d){7,8}|0\d{1,2}(?:[-\s]?\d){6,8}/u);
  if (phone?.[0]) {
    const normalized = normalizePhone(phone[0]);
    if (normalized) return normalized;
  }

  const line = text.match(/(?:line|LINE|賴)(?:\s*(?:id|ID))?\s*(?:是|為|:|：)?\s*([A-Za-z0-9._-]{3,30})/u);
  if (line?.[1]) return `LINE:${line[1]}`;

  const generic = text.match(/(?:聯絡方式|聯絡電話|電話|手機)(?:\s*(?:是|為|:|：))?\s*([^，。！？\s]{4,40})/u);
  if (generic?.[1]) return generic[1].trim();
  return "";
}

function isMostlyIntakeMetadata(text: string) {
  return /^(?:我姓|姓氏|姓|房號|房間|住在|住|電話|手機|聯絡方式|line|LINE|賴)/u.test(text.trim());
}

function addIssuePart(state: GuestIntakeState, text: string) {
  const cleaned = text.trim();
  if (!cleaned || isMostlyIntakeMetadata(cleaned)) return;
  const key = compact(cleaned);
  if (!key) return;
  if (state.issueParts.some((item) => compact(item) === key)) return;
  state.issueParts.push(cleaned);
  state.issueParts = state.issueParts.slice(-8);
}

function fingerprint(state: GuestIntakeState) {
  return compact([state.roomNumber, state.surname, state.contact, ...state.issueParts].join("|"));
}

function recentlySent(fp: string) {
  if (typeof window === "undefined") return false;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LAST_SENT_KEY) ?? "null") as { fingerprint?: string; at?: number } | null;
    return Boolean(parsed?.fingerprint === fp && Date.now() - Number(parsed?.at ?? 0) < LOCAL_DUPLICATE_MS);
  } catch {
    return false;
  }
}

function rememberSent(fp: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_SENT_KEY, JSON.stringify({ fingerprint: fp, at: Date.now() }));
}

export async function processNuboGuestServiceTranscript(transcript: string): Promise<void> {
  if (typeof window === "undefined") return;
  const text = transcript?.trim();
  if (!text) return;

  const classification = classifyNuboGuestServiceTranscript(text);
  const state = loadState();

  if (!state.active && !classification.matched) return;
  if (!state.active && classification.matched) {
    state.active = true;
    state.startedAt = Date.now();
  }

  state.updatedAt = Date.now();
  state.surname ||= extractSurname(text);
  state.roomNumber ||= extractRoom(text);
  state.contact ||= extractContact(text);

  if (classification.matched || state.active) addIssuePart(state, text);
  saveState(state);

  const issue = state.issueParts.join("；").trim();
  if (!state.surname || !state.roomNumber || !state.contact || !issue) return;

  const fp = fingerprint(state);
  if (!fp || recentlySent(fp)) {
    clearState();
    return;
  }

  const response = await fetch("/api/notify/guest-service", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      surname: state.surname,
      roomNumber: state.roomNumber,
      contact: state.contact,
      issue,
      source: "deterministic-transcript-fallback-v2",
    }),
    keepalive: true,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error ?? `客務通知寄送失敗：${response.status}`);
  }

  if (payload?.sent === true || payload?.duplicate === true) {
    rememberSent(fp);
    clearState();
  }
}
