"use client";

type NuboAudioWindow = Window & { __nuboAudioContext?: AudioContext };

const TONE_MS = 680;
const GAP_MS = 420;
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
        gain.gain.linearRampToValueAtTime(0.08, at + 0.015);
        gain.gain.setValueAtTime(0.08, at + (TONE_MS - 20) / 1000);
        gain.gain.linearRampToValueAtTime(0, at + TONE_MS / 1000);
        gain.connect(context.destination);

        let finished = 0;
        for (const frequency of [425, 480]) {
          const oscillator = context.createOscillator();
          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          oscillator.connect(gain);
          oscillator.start(at);
          oscillator.stop(at + TONE_MS / 1000 + 0.01);
          oscillator.onended = () => {
            oscillator.disconnect();
            finished += 1;
            if (finished === 2) gain.disconnect();
          };
        }
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
