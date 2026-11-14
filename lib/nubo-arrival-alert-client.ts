"use client";

import { classifyNuboArrivalIntent, isNuboArrivalCancellation, type NuboArrivalIntent } from "@/lib/nubo-arrival-intent";

const DEVICE_KEY = "nubo_arrival_alert_device_v1";
const DEBOUNCE_MS = 1000;
const UTTERANCE_GAP_MS = 3_000;
const MODEL_REUSE_MS = 30_000;

let pendingTranscript = "";
let pendingUtteranceId = "";
let timer: number | null = null;
let activeUtteranceId = "";
let activeTranscript = "";
let activeTranscriptAt = 0;
let lastSentUtteranceId = "";

function deviceId() {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = window.crypto.randomUUID();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "nubo-tablet";
  }
}

function newUtteranceId() {
  return typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeUtterance(text: string) {
  return text.normalize("NFKC").toLowerCase().replace(/[\s　，。！？、,.!?]/g, "");
}

function trackUserUtterance(text: string) {
  const normalized = normalizeUtterance(text);
  const now = Date.now();
  const changedUtterance = Boolean(
    activeTranscript &&
    !normalized.includes(activeTranscript) &&
    !activeTranscript.includes(normalized),
  );
  if (!activeUtteranceId || now - activeTranscriptAt > UTTERANCE_GAP_MS || changedUtterance) {
    activeUtteranceId = newUtteranceId();
  }
  activeTranscript = normalized;
  activeTranscriptAt = now;
  return activeUtteranceId;
}

export async function sendNuboArrivalIntent(
  transcript: string,
  intent: NuboArrivalIntent,
  source: "transcript" | "model",
  utteranceId?: string,
) {
  if (typeof window === "undefined" || !transcript.trim()) return { sent: false };
  const requestUtteranceId = utteranceId ||
    (activeUtteranceId && Date.now() - activeTranscriptAt < MODEL_REUSE_MS
      ? activeUtteranceId
      : newUtteranceId());
  if (lastSentUtteranceId === requestUtteranceId) {
    return { sent: false, duplicate: true };
  }

  const response = await fetch("/api/notify/arrival-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript: transcript.trim().slice(0, 500),
      intent,
      source,
      deviceId: deviceId(),
      utteranceId: requestUtteranceId,
    }),
    keepalive: true,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("LINE 到店通知暫時未送達");
  if (result.sent || result.duplicate) {
    lastSentUtteranceId = requestUtteranceId;
  }
  return result;
}

export function queueNuboArrivalTranscript(transcript: string) {
  if (typeof window === "undefined") return;
  const text = transcript.trim();
  const utteranceId = trackUserUtterance(text);
  if (isNuboArrivalCancellation(text)) {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    pendingTranscript = "";
    pendingUtteranceId = "";
    return;
  }
  const intent = classifyNuboArrivalIntent(text);
  // Gemini may follow a complete phrase with shorter transcription revisions.
  // Those revisions must not erase a recognized arrival request.
  if (!intent) return;
  if (timer !== null) window.clearTimeout(timer);
  pendingTranscript = text;
  pendingUtteranceId = utteranceId;

  timer = window.setTimeout(() => {
    timer = null;
    const latest = pendingTranscript;
    const latestUtteranceId = pendingUtteranceId;
    pendingTranscript = "";
    pendingUtteranceId = "";
    const latestIntent = classifyNuboArrivalIntent(latest);
    if (!latestIntent) return;
    void sendNuboArrivalIntent(latest, latestIntent, "transcript", latestUtteranceId)
      .catch(() => console.warn("[arrival-alert] LINE delivery failed"));
  }, DEBOUNCE_MS);
}
