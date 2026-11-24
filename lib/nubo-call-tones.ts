"use client";

const RING_URL = "/audio/nubo-guest-call-ring.mp3";
const PLAYBACK_TIMEOUT_MS = 4000;

export function playNuboCallTones() {
  const audio = new Audio(RING_URL);
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(finish, PLAYBACK_TIMEOUT_MS);

    function finish() {
      window.clearTimeout(timer);
      audio.removeEventListener("ended", finish);
      audio.removeEventListener("error", finish);
      audio.pause();
      resolve();
    }

    audio.addEventListener("ended", finish);
    audio.addEventListener("error", finish);
    void audio.play().catch(finish);
  });
}
