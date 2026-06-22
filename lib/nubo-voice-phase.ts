"use client";

export type NuboVoicePhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export function notifyNuboVoicePhase(phase: NuboVoicePhase) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("nubo-voice-phase", { detail: { phase } }),
  );
}
