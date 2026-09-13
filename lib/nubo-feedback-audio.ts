"use client";

let lastNoticeAt = 0;

export function speakNuboNotice(text = "請稍等！") {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  const now = Date.now();
  if (now - lastNoticeAt < 2500) return;
  lastNoticeAt = now;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-TW";
  utterance.rate = 1.02;
  utterance.pitch = 1.08;
  utterance.volume = 0.85;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function playTechSearchSound(_durationMs = 1800) {
  // NUBO_BEEP_HARD_OFF_V2
  // The previous "tech search" effect synthesized 660-1760 Hz oscillators.
  // On Android/WebView speaker paths those tones can be indistinguishable from
  // the unwanted beep being debugged. Keep this intentionally silent until a
  // sampled, band-limited effect is introduced as a separate media asset.
  return;
}
