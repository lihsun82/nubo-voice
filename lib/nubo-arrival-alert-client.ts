"use client";

import { classifyNuboArrivalIntent, isNuboArrivalCancellation, type NuboArrivalIntent } from "@/lib/nubo-arrival-intent";

const DEVICE_KEY = "nubo_arrival_alert_device_v1";
const DEBOUNCE_MS = 1000;
const LOCAL_COOLDOWN_MS = 45_000;

let pendingTranscript = "";
let timer: number | null = null;
let lastIntent: NuboArrivalIntent | null = null;
let lastSentAt = 0;

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

export async function sendNuboArrivalIntent(
  transcript: string,
  intent: NuboArrivalIntent,
  source: "transcript" | "model",
) {
  if (typeof window === "undefined" || !transcript.trim()) return { sent: false };
  if (lastIntent === intent && Date.now() - lastSentAt < LOCAL_COOLDOWN_MS) {
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
    }),
    keepalive: true,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("LINE 到店通知暫時未送達");
  if (result.sent || result.duplicate) {
    lastIntent = intent;
    lastSentAt = Date.now();
  }
  return result;
}

export function queueNuboArrivalTranscript(transcript: string) {
  if (typeof window === "undefined") return;
  const text = transcript.trim();
  if (isNuboArrivalCancellation(text)) {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    pendingTranscript = "";
    return;
  }
  const intent = classifyNuboArrivalIntent(text);
  // Gemini may follow a complete phrase with shorter transcription revisions.
  // Those revisions must not erase a recognized arrival request.
  if (!intent) return;
  if (timer !== null) window.clearTimeout(timer);
  pendingTranscript = text;

  timer = window.setTimeout(() => {
    timer = null;
    const latest = pendingTranscript;
    pendingTranscript = "";
    const latestIntent = classifyNuboArrivalIntent(latest);
    if (!latestIntent) return;
    void sendNuboArrivalIntent(latest, latestIntent, "transcript")
      .catch(() => console.warn("[arrival-alert] LINE delivery failed"));
  }, DEBOUNCE_MS);
}
