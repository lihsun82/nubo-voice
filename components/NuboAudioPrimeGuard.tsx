"use client";

import { useEffect } from "react";
import {
  preferMultimediaAudioContext,
  preferMultimediaMediaElement,
} from "@/lib/browser-speaker-output";

type NuboAudioWindow = Window & {
  __nuboAudioPrimed?: boolean;
  __nuboAudioContext?: AudioContext;
  __nuboAudioOscillator?: OscillatorNode;
  __nuboAudioGain?: GainNode;
  __nuboSilentAudio?: HTMLAudioElement;
  webkitAudioContext?: typeof AudioContext;
};

const SILENT_WAV =
  "data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function preloadYouTubeApi() {
  if (
    document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]',
    )
  ) {
    return;
  }

  const script = document.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.async = true;
  document.head.appendChild(script);
}

async function primeNuboAudioSession() {
  const host = window as NuboAudioWindow;

  try {
    const AudioContextConstructor =
      window.AudioContext ?? host.webkitAudioContext;

    if (AudioContextConstructor) {
      const context =
        host.__nuboAudioContext ??
        new AudioContextConstructor({ latencyHint: "playback" });
      host.__nuboAudioContext = context;

      await preferMultimediaAudioContext(context);

      if (!host.__nuboAudioOscillator || !host.__nuboAudioGain) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.frequency.value = 20;
        gain.gain.value = 0.000001;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();

        host.__nuboAudioOscillator = oscillator;
        host.__nuboAudioGain = gain;
      }

      await context.resume().catch(() => undefined);
    }
  } catch {
    // Web Audio 失敗時仍繼續嘗試 HTMLAudio 解鎖。
  }

  try {
    const audio = host.__nuboSilentAudio ?? new Audio(SILENT_WAV);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.001;
    audio.setAttribute("playsinline", "true");
    host.__nuboSilentAudio = audio;
    await preferMultimediaMediaElement(audio);
    await audio.play().catch(() => undefined);
  } catch {
    // HTMLAudio 不可用時交由 Web Audio 與播放器處理。
  }

  host.__nuboAudioPrimed = true;
  preloadYouTubeApi();
  window.dispatchEvent(new CustomEvent("nubo-audio-primed"));
  window.dispatchEvent(new CustomEvent("nubo-speaker-route-ready"));
}

export function NuboAudioPrimeGuard() {
  useEffect(() => {
    const primeFromGesture = () => void primeNuboAudioSession();

    window.addEventListener("pointerdown", primeFromGesture, true);
    window.addEventListener("touchstart", primeFromGesture, true);
    window.addEventListener("keydown", primeFromGesture, true);

    const resumeWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      const host = window as NuboAudioWindow;
      if (!host.__nuboAudioPrimed) return;
      void primeNuboAudioSession();
    };

    const refreshForMusic = () => void primeNuboAudioSession();

    document.addEventListener("visibilitychange", resumeWhenVisible);
    window.addEventListener("nubo-inline-music-play", refreshForMusic);

    return () => {
      window.removeEventListener("pointerdown", primeFromGesture, true);
      window.removeEventListener("touchstart", primeFromGesture, true);
      window.removeEventListener("keydown", primeFromGesture, true);
      document.removeEventListener("visibilitychange", resumeWhenVisible);
      window.removeEventListener("nubo-inline-music-play", refreshForMusic);
    };
  }, []);

  return null;
}
