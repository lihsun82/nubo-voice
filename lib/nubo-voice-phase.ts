"use client";

export type NuboVoicePhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

let lastSpeakingAt = 0;
let delayedListeningTimer: number | null = null;
const SPEAKING_HOLD_MS = 2400;

function dispatchPhase(phase: NuboVoicePhase) {
  window.dispatchEvent(
    new CustomEvent("nubo-voice-phase", { detail: { phase } }),
  );
}

export function notifyNuboVoicePhase(phase: NuboVoicePhase) {
  if (typeof window === "undefined") return;

  if (phase === "speaking") {
    lastSpeakingAt = Date.now();
    if (delayedListeningTimer !== null) {
      window.clearTimeout(delayedListeningTimer);
      delayedListeningTimer = null;
    }
    dispatchPhase("speaking");
    return;
  }

  if (phase === "listening") {
    const elapsed = Date.now() - lastSpeakingAt;
    const remaining = SPEAKING_HOLD_MS - elapsed;

    if (remaining > 0) {
      if (delayedListeningTimer !== null) {
        window.clearTimeout(delayedListeningTimer);
      }
      delayedListeningTimer = window.setTimeout(() => {
        delayedListeningTimer = null;
        dispatchPhase("listening");
      }, remaining);
      return;
    }
  }

  if (delayedListeningTimer !== null) {
    window.clearTimeout(delayedListeningTimer);
    delayedListeningTimer = null;
  }

  dispatchPhase(phase);
}
