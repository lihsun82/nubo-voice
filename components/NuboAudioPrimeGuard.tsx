"use client";

import { useEffect } from "react";

type NuboAudioWindow = Window & {
  __nuboAudioPrimed?: boolean;
  __nuboAudioContext?: AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

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
        new AudioContextConstructor();
      host.__nuboAudioContext = context;

      // A real user gesture is enough to unlock Web Audio. Do not keep a
      // permanent oscillator or looping HTMLAudio element alive: the old V22
      // guard used a malformed/truncated silent WAV in an infinite loop, which
      // can produce repeated Android/Chrome audio-pipeline ticks/beeps.
      if (context.state === "suspended") {
        await context.resume().catch(() => undefined);
      }
    }
  } catch {
    // Audio priming is best-effort; NUBO voice can create its own context.
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
