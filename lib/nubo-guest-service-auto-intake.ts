"use client";

import { classifyNuboGuestServiceTranscript } from "@/lib/nubo-guest-service-alert";

type ComplaintIntakeState = {
  active: boolean;
  startedAt: number;
  updatedAt: number;
  surname: string;
  roomNumber: string;
  issueParts: string[];
};

const STORAGE_KEY = "nubo_complaint_intake_v3";
const LAST_SENT_KEY = "nubo_complaint_last_sent_v3";
const INTAKE_TTL_MS = 20 * 60_000;
const LOCAL_DUPLICATE_MS = 3 * 60_000;
const COMPLETE_UTTERANCE_QUIET_MS = 1_000;

let pendingSendTimer: number | null = null;

function emptyState(): ComplaintIntakeState {
  const now = Date.now();
  return {
    active: false,
    startedAt: now,
    updatedAt: now,
    surname: "",
    roomNumber: "",
    issueParts: [],
  };
}

function loadState(): ComplaintIntakeState {
  if (typeof window === "undefined") return emptyState();
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as ComplaintIntakeState | null;
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

function saveState(state: ComplaintIntakeState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function compact(value: string) {
  return value
    .replace(/[\s　，,。.!！?？、:：;；'"“”‘’（）()【】\[\]-]+/g, "")
    .toLowerCase();
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

function isMostlyIntakeMetadata(text: string) {
  return /^(?:我姓|姓氏|姓|房號|房間|住在|住)/u.test(text.trim());
}

function isSubstantiveIssue(text: string) {
  const normalized = compact(text);
  if (!normalized) return false;

  if (
    /^(?:尚未提供(?:客訴|抱怨|內容)?|未提供(?:客訴|抱怨|內容)?|沒有提供(?:客訴|抱怨|內容)?|待補(?:充)?|待確認|不知道|沒有|無|n\/?a)$/iu.test(
      normalized,
    )
  ) {
    return false;
  }

  if (
    /^(?:(?:我要|我想|我要來|想要|需要)?(?:客訴|投訴|抱怨|反映|反應))$/u.test(
      normalized,
    )
  ) {
    return false;
  }

  return normalized.length >= 2;
}

function addIssuePart(state: ComplaintIntakeState, text: string) {
  const cleaned = text.trim();
  if (!cleaned || isMostlyIntakeMetadata(cleaned) || !isSubstantiveIssue(cleaned)) {
    return;
  }

  const key = compact(cleaned);
  if (!key) return;
  if (state.issueParts.some((item) => compact(item) === key)) return;
  state.issueParts.push(cleaned);
  state.issueParts = state.issueParts.slice(-8);
}

function fingerprint(state: ComplaintIntakeState) {
  return compact([state.roomNumber, state.surname, ...state.issueParts].join("|"));
}

function recentlySent(fp: string) {
  if (typeof window === "undefined") return false;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LAST_SENT_KEY) ?? "null",
    ) as { fingerprint?: string; at?: number } | null;
    return Boolean(
      parsed?.fingerprint === fp &&
        Date.now() - Number(parsed?.at ?? 0) < LOCAL_DUPLICATE_MS,
    );
  } catch {
    return false;
  }
}

function rememberSent(fp: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    LAST_SENT_KEY,
    JSON.stringify({ fingerprint: fp, at: Date.now() }),
  );
}

function cancelPendingSend() {
  if (pendingSendTimer === null || typeof window === "undefined") return;
  window.clearTimeout(pendingSendTimer);
  pendingSendTimer = null;
}

function scheduleCompletedIntakeSend() {
  if (typeof window === "undefined") return;
  cancelPendingSend();

  pendingSendTimer = window.setTimeout(() => {
    pendingSendTimer = null;
    const latest = loadState();
    const issue = latest.issueParts.join("；").trim();

    if (
      !latest.active ||
      !latest.roomNumber ||
      !latest.surname ||
      !isSubstantiveIssue(issue)
    ) {
      return;
    }

    const quietFor = Date.now() - latest.updatedAt;
    if (quietFor < COMPLETE_UTTERANCE_QUIET_MS) {
      scheduleCompletedIntakeSend();
      return;
    }

    const fp = fingerprint(latest);
    if (!fp || recentlySent(fp)) {
      clearState();
      return;
    }

    void fetch("/api/notify/guest-service", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        complaint: true,
        surname: latest.surname,
        roomNumber: latest.roomNumber,
        issue,
        source: "complaint-three-field-intake-v1",
      }),
      keepalive: true,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload?.error ?? `客訴通知寄送失敗：${response.status}`,
          );
        }

        if (payload?.sent === true || payload?.duplicate === true) {
          rememberSent(fp);
          clearState();
        }
      })
      .catch((error) => {
        console.error("[complaint-three-field-intake] send failed", error);
      });
  }, COMPLETE_UTTERANCE_QUIET_MS);
}

export async function processNuboGuestServiceTranscript(
  transcript: string,
): Promise<void> {
  if (typeof window === "undefined") return;
  const text = transcript?.trim();
  if (!text) return;

  const classification = classifyNuboGuestServiceTranscript(text);
  const state = loadState();
  const isComplaint =
    classification.matched && classification.category === "complaint";

  if (!state.active && !isComplaint) return;
  if (!state.active && isComplaint) {
    state.active = true;
    state.startedAt = Date.now();
  }

  state.updatedAt = Date.now();
  state.surname ||= extractSurname(text);
  state.roomNumber ||= extractRoom(text);

  if (isComplaint || state.active) addIssuePart(state, text);
  saveState(state);

  const issue = state.issueParts.join("；").trim();
  if (!state.roomNumber || !state.surname || !isSubstantiveIssue(issue)) {
    cancelPendingSend();
    return;
  }

  scheduleCompletedIntakeSend();
}
