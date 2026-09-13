"use client";

let lastNoticeAt = 0;

type BrowserAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext ?? (window as BrowserAudioWindow).webkitAudioContext;
  if (!AudioContextClass) return null;
  return new AudioContextClass();
}

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

export function playTechSearchSound(durationMs = 1800) {
  const audio = getAudioContext();
  if (!audio) return;

  const duration = Math.max(500, Math.min(durationMs, 4000)) / 1000;
  const now = audio.currentTime;
  const master = audio.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.12, now + 0.04);
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  master.connect(audio.destination);

  const lead = audio.createOscillator();
  const shimmer = audio.createOscillator();
  const pulse = audio.createGain();

  lead.type = "sine";
  shimmer.type = "triangle";
  lead.frequency.setValueAtTime(660, now);
  lead.frequency.exponentialRampToValueAtTime(1320, now + duration * 0.45);
  lead.frequency.exponentialRampToValueAtTime(880, now + duration);
  shimmer.frequency.setValueAtTime(1760, now);
  shimmer.frequency.exponentialRampToValueAtTime(990, now + duration);

  pulse.gain.setValueAtTime(0.35, now);
  pulse.gain.linearRampToValueAtTime(0.9, now + duration * 0.18);
  pulse.gain.linearRampToValueAtTime(0.25, now + duration);

  lead.connect(pulse);
  shimmer.connect(pulse);
  pulse.connect(master);

  void audio.resume();
  lead.start(now);
  shimmer.start(now + 0.05);
  lead.stop(now + duration);
  shimmer.stop(now + duration);

  window.setTimeout(() => void audio.close(), duration * 1000 + 150);
}
