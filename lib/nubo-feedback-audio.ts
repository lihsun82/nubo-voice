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
  // The previous search effect synthesized 660-1760 Hz oscillator tones.
  // Those tones overlap perceptually with the residual beep being debugged and
  // are nonessential. Keep them hard-disabled so Gemini PCM/TTS is the only
  // intentional NUBO audio during a voice turn.
  return;
}
