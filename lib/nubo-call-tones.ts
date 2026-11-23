"use client";

/** Authentic ringing audio supplied by the hotel owner (source kept off git until asset is cleared). */
const RING_ASSET = "/audio/nubo-phone-ring.mp3";
const AUDIO_LIMIT_MS = 4000;
const FALLBACK_TONE_MS = 800;
const FALLBACK_GAP_MS = 400;

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function playRecordedRing() {
  const audio = new Audio(RING_ASSET);
  audio.preload = "auto";
  audio.volume = 0.75;
  let completed = false;
  const playPromise = new Promise<boolean>((resolve) => {
    const finish = (ok: boolean) => {
      if (completed) return;
      completed = true;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      resolve(ok);
    };
    audio.addEventListener("ended", () => finish(true), { once: true });
    audio.addEventListener("error", () => finish(false), { once: true });
    void audio.play().catch(() => finish(false));
    window.setTimeout(() => finish(true), AUDIO_LIMIT_MS);
  });
  return playPromise;
}

/** Backward-compatible fallback for offline devices or missing static media. */
async function playFallbackDialTones() {
  type Primed = Window & { __nuboAudioContext?: AudioContext };
  const host = window as Primed;
  const primed = host.__nuboAudioContext;
  const ownsContext = !primed || primed.state === "closed";
  let context: AudioContext | null = null;
  let scheduled = false;
  try {
    context = primed && primed.state !== "closed"
      ? primed : new AudioContext({ latencyHint: "interactive" });
    await context.resume();
    if (context.state === "running") {
      const start = context.currentTime + 0.03;
      scheduled = true;
      for (let i = 0; i < 2; i += 1) {
        const at = start + i * (FALLBACK_TONE_MS + FALLBACK_GAP_MS) / 1000;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.16, at + 0.02);
        gain.gain.setValueAtTime(0.16, at + (FALLBACK_TONE_MS - 25) / 1000);
        gain.gain.linearRampToValueAtTime(0, at + FALLBACK_TONE_MS / 1000);
        gain.connect(context.destination);
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = 425;
        oscillator.connect(gain);
        oscillator.start(at);
        oscillator.stop(at + FALLBACK_TONE_MS / 1000 + 0.01);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      }
    }
  } catch {
    // Voice may still connect without a sound.
  }
  if (scheduled) await wait(FALLBACK_TONE_MS * 2 + FALLBACK_GAP_MS + 70);
  if (ownsContext && context) await context.close().catch(() => undefined);
}

/** Wait for a short real ring before initiating the normal voice session. Never play 30s source. */
export async function playNuboCallTones() {
  // The file must be installed under public/audio/ prior to enabling this draft.
  const usedRecording = await playRecordedRing().catch(() => false);
  if (!usedRecording) await playFallbackDialTones();
}
