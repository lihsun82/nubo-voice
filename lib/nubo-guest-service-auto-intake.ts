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

export function activateNuboComplaintIntake(seed?: {
  roomNumber?: string;
  surname?: string;
}) {
  if (typeof window === "undefined") return;
  const state = loadState();
  const now = Date.now();
  state.active = true;
  if (!state.startedAt) state.startedAt = now;
  state.updatedAt = now;
  if (seed?.roomNumber && !state.roomNumber) state.roomNumber = seed.roomNumber.trim();
  if (seed?.surname && !state.surname) state.surname = seed.surname.trim();
  saveState(state);
}

function compact(value: string) {
  return value
    .replace(/[\s　，,。.!！?？、:：;；'"“”‘’（）()【】\[\]-]+/g, "")
    .toLowerCase();
}

const ROOM_DIGITS: Record<string, string> = {
  零: "0",
  〇: "0",
  一: "1",
  二: "2",
  兩: "2",
  三: "3",
  四: "4",
  五: "5",
  六: "6",
  七: "7",
  八: "8",
  九: "9",
};

function chineseInteger(value: string) {
  const raw = value.replace(/[\s　]/g, "");
  if (/^\d+$/.test(raw)) return Number(raw);
  if (/^[零〇一二兩三四五六七八九]{2,4}$/u.test(raw)) {
    return Number([...raw].map((char) => ROOM_DIGITS[char] ?? "").join(""));
  }
  const hundred = raw.match(/^([一二兩三四五六七八九])百(?:([一二兩三四五六七八九])?十)?([一二兩三四五六七八九])?$/u);
  if (hundred) {
    const h = Number(ROOM_DIGITS[hundred[1]]);
    const t = hundred[2] ? Number(ROOM_DIGITS[hundred[2]]) : 0;
    const o = hundred[3] ? Number(ROOM_DIGITS[hundred[3]]) : 0;
    return h * 100 + t * 10 + o;
  }
  const ten = raw.match(/^([一二兩三四五六七八九])?十([一二兩三四五六七八九])?$/u);
  if (ten) {
    const t = ten[1] ? Number(ROOM_DIGITS[ten[1]]) : 1;
    const o = ten[2] ? Number(ROOM_DIGITS[ten[2]]) : 0;
    return t * 10 + o;
  }
  if (raw.length === 1 && raw in ROOM_DIGITS) return Number(ROOM_DIGITS[raw]);
  return Number.NaN;
}

function normalizeRoomToken(value: string) {
  const raw = value.replace(/[\s　]/g, "").toUpperCase();
  const alphaNumeric = raw.match(/^([A-Z]?)(\d{2,4})$/u);
  if (alphaNumeric) return `${alphaNumeric[1]}${alphaNumeric[2]}`;
  const numeric = chineseInteger(raw);
  if (Number.isFinite(numeric) && numeric >= 10 && numeric <= 9999) {
    return String(numeric);
  }
  return "";
}

function extractSurname(text: string, allowBare: boolean) {
  const explicit = text.match(/(?:我姓|姓氏(?:是|為)?|姓)\s*([\p{Script=Han}]{1,2})/u);
  if (explicit?.[1]) return explicit[1];
  const title = text.match(/([\p{Script=Han}]{1,2})\s*(?:先生|小姐|女士)/u);
  if (title?.[1]) return title[1];
  if (allowBare) {
    const bare = text.trim().match(/^([\p{Script=Han}]{1,2})$/u);
    if (bare?.[1] && !/^(好的|可以|不要|不用|謝謝|沒事|不是)$/u.test(bare[1])) {
      return bare[1];
    }
  }
  return "";
}

function extractRoom(text: string, allowBare: boolean) {
  const floorRoom = text.match(
    /([零〇一二兩三四五六七八九十百\d]{1,4})\s*樓\s*([零〇一二兩三四五六七八九十\d]{1,3})\s*(?:號?房|房間)?/u,
  );
  if (floorRoom) {
    const floor = chineseInteger(floorRoom[1]);
    const room = chineseInteger(floorRoom[2]);
    if (Number.isFinite(floor) && Number.isFinite(room) && floor > 0 && room >= 0 && room < 100) {
      return `${floor}${String(room).padStart(2, "0")}`;
    }
  }

  const explicit = text.match(
    /(?:房號|房間|住在|住)\s*(?:是|為)?\s*([A-Za-z]?\d{2,4}|[零〇一二兩三四五六七八九十百]{2,6})\s*(?:號?房)?/iu,
  );
  if (explicit?.[1]) {
    const normalized = normalizeRoomToken(explicit[1]);
    if (normalized) return normalized;
  }

  const suffixed = text.match(
    /([A-Za-z]?\d{2,4}|[零〇一二兩三四五六七八九十百]{2,6})\s*(?:號?房|房間)/iu,
  );
  if (suffixed?.[1]) {
    const normalized = normalizeRoomToken(suffixed[1]);
    if (normalized) return normalized;
  }

  if (allowBare) {
    const bare = text.trim().match(
      /^(?:房號(?:是|為)?\s*)?([A-Za-z]?\d{2,4}|[零〇一二兩三四五六七八九十百]{2,6})(?:\s*號?房)?$/iu,
    );
    if (bare?.[1]) {
      const normalized = normalizeRoomToken(bare[1]);
      if (normalized) return normalized;
    }
  }

  return "";
}

function isMostlyIntakeMetadata(text: string) {
  return /^(?:我姓|姓氏|姓|房號|房間|住在|住)/u.test(text.trim());
}

function isBareMetadataReply(text: string, roomCandidate: string, surnameCandidate: string) {
  const raw = text.trim();
  if (roomCandidate && /^(?:房號(?:是|為)?\s*)?(?:[A-Za-z]?\d{2,4}|[零〇一二兩三四五六七八九十百]{2,6})(?:\s*號?房)?$/iu.test(raw)) {
    return true;
  }
  if (surnameCandidate && /^[\p{Script=Han}]{1,2}$/u.test(raw)) return true;
  return false;
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
        source: "complaint-three-field-intake-v2-carryover",
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

  const roomCandidate = !state.roomNumber
    ? extractRoom(text, state.active)
    : "";
  if (roomCandidate) state.roomNumber = roomCandidate;

  const surnameCandidate = !state.surname
    ? extractSurname(text, state.active && Boolean(state.roomNumber))
    : "";
  if (surnameCandidate) state.surname = surnameCandidate;

  state.updatedAt = Date.now();

  const metadataOnly = isMostlyIntakeMetadata(text) ||
    isBareMetadataReply(text, roomCandidate, surnameCandidate);
  if ((isComplaint || state.active) && !metadataOnly) addIssuePart(state, text);
  saveState(state);

  const issue = state.issueParts.join("；").trim();
  if (!state.roomNumber || !state.surname || !isSubstantiveIssue(issue)) {
    cancelPendingSend();
    return;
  }

  scheduleCompletedIntakeSend();
}
