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
const NUBO_SILENT_STORAGE_KEY = "nubo_silent_until_wake";

function notifyNativePhase(phase: NuboVoicePhase) {
  try {
    const nativeBridge = (window as typeof window & {
      NuboNative?: { setVoicePhase?: (phase: string) => boolean };
    }).NuboNative;

    if (!nativeBridge?.setVoicePhase) return;

    // Explicit NUBO silence always wins over ambient Sense reactions.
    const isSilent =
      window.localStorage.getItem(NUBO_SILENT_STORAGE_KEY) === "true";
    nativeBridge.setVoicePhase(isSilent ? "speaking" : phase);
  } catch {
    // Browser-only NUBO keeps working when the native bridge is absent.
  }
}

function dispatchPhase(phase: NuboVoicePhase) {
  window.dispatchEvent(
    new CustomEvent("nubo-voice-phase", { detail: { phase } }),
  );
  notifyNativePhase(phase);
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
