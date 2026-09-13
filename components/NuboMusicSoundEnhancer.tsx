"use client";

import { useEffect } from "react";

const NORMAL_VOLUME = 92;
const DUCK_VOLUME = 34;
const APPLY_DELAYS = [0, 120, 420, 900, 1800];

function findMusicIframe() {
  return document.querySelector<HTMLIFrameElement>(
    ".nubo-inline-music-frame iframe",
  );
}

function sendPlayerCommand(func: string, args: unknown[] = []) {
  const target = findMusicIframe()?.contentWindow;
  if (!target) return;

  try {
    target.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "https://www.youtube.com",
    );
  } catch {
    // The next scheduled application will retry after the iframe is ready.
  }
}

export function NuboMusicSoundEnhancer() {
  useEffect(() => {
    let voicePhase = "listening";
    let timers: number[] = [];

    const clearTimers = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [];
    };

    const targetVolume = () =>
      voicePhase === "thinking" || voicePhase === "speaking"
        ? DUCK_VOLUME
        : NORMAL_VOLUME;

    const applySoundProfile = () => {
      clearTimers();
      for (const delay of APPLY_DELAYS) {
        timers.push(
          window.setTimeout(() => {
            sendPlayerCommand("unMute");
            sendPlayerCommand("setVolume", [targetVolume()]);
          }, delay),
        );
      }
    };

    const onVoicePhase = (event: Event) => {
      voicePhase =
        (event as CustomEvent<{ phase?: string }>).detail?.phase ?? "listening";
      applySoundProfile();
    };

    const onSong = () => applySoundProfile();
    const onVisibility = () => {
      if (document.visibilityState === "visible") applySoundProfile();
    };

    const observer = new MutationObserver(() => {
      if (findMusicIframe()) applySoundProfile();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("nubo-voice-phase", onVoicePhase);
    window.addEventListener("nubo-inline-music-play", onSong);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimers();
      observer.disconnect();
      window.removeEventListener("nubo-voice-phase", onVoicePhase);
      window.removeEventListener("nubo-inline-music-play", onSong);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
