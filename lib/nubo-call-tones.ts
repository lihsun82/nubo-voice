"use client";

type NuboAudioWindow = Window & { __nuboAudioContext?: AudioContext };

const TONE_MS = 800;
const GAP_MS = 400;
const RING_COUNT = 2;
const TOTAL_MS = TONE_MS * RING_COUNT + GAP_MS * (RING_COUNT - 1);

export async function playNuboCallTones() {
  const host = window as NuboAudioWindow;
  const primed = host.__nuboAudioContext;
  const ownsContext = !primed || primed.state === "closed";
  let context: AudioContext | null = null;
  let scheduled = false;

  try {
    context = primed && primed.state !== "closed"
      ? primed
      : new AudioContext({ latencyHint: "interactive" });
    await context.resume();

    if (context.state === "running") {
      const start = context.currentTime + 0.03;
      scheduled = true;
      for (let index = 0; index < RING_COUNT; index += 1) {
        const at = start + index * (TONE_MS + GAP_MS) / 1000;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.16, at + 0.02);
        gain.gain.setValueAtTime(0.16, at + (TONE_MS - 25) / 1000);
        gain.gain.linearRampToValueAtTime(0, at + TONE_MS / 1000);
        gain.connect(context.destination);

        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = 425;
        oscillator.connect(gain);
        oscillator.start(at);
        oscillator.stop(at + TONE_MS / 1000 + 0.01);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      }
    }
  } catch {
    // Continue to voice even if this browser cannot play the call signal.
  }

  if (scheduled) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, TOTAL_MS + 70);
    });
  }

  if (ownsContext && context) {
    await context.close().catch(() => undefined);
  }
}
