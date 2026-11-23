"use client";

// A short 2.12-second cut from the owner-provided telephone ring recording.
// The original recording contains a much longer ring/pause cycle; using one
// burst keeps the call-button feedback recognizable without delaying connection.
const NUBO_PHONE_RING_URL = "/nubo-phone-ring.mp3";
const NUBO_PHONE_RING_VOLUME = 0.72;

export async function playNuboCallTones() {
  if (typeof window === "undefined") return;

  const audio = new Audio(NUBO_PHONE_RING_URL);
  audio.preload = "auto";
  audio.volume = NUBO_PHONE_RING_VOLUME;
  audio.playsInline = true;

  const finished = new Promise<void>((resolve) => {
    const finish = () => resolve();
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
  });

  try {
    await audio.play();
    await finished;
  } catch {
    // A blocked or unavailable ringtone must never prevent NUBO from connecting.
  } finally {
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // Ignore media elements that never entered a playable state.
    }
    audio.removeAttribute("src");
    audio.load();
  }
}
