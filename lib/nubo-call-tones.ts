"use client";

type NuboAudioWindow = Window & { __nuboAudioContext?: AudioContext };

const TONE_MS = 220;
const GAP_MS = 160;
const TOTAL_MS = TONE_MS * 3 + GAP_MS * 2;

export async function playNuboCallTones() {
  const host = window as NuboAudioWindow;
  const primed = host.__nuboAudioContext;
  const ownsContext = !primed || primed.state === "closed";
  let context: AudioContext | null = null;

  try {
    context = ownsContext
      ? new AudioContext({ latencyHint: "interactive" })
      : primed;
    await context.resume();

    if (context.state === "running") {
      const start = context.currentTime + 0.03;
      for (let index = 0; index < 3; index += 1) {
        const at = start + index * (TONE_MS + GAP_MS) / 1000;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.12, at + 0.015);
        gain.gain.setValueAtTime(0.12, at + (TONE_MS - 20) / 1000);
        gain.gain.linearRampToValueAtTime(0, at + TONE_MS / 1000);
        gain.connect(context.destination);

        for (const frequency of [425, 480]) {
          const oscillator = context.createOscillator();
          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          oscillator.connect(gain);
          oscillator.start(at);
          oscillator.stop(at + TONE_MS / 1000 + 0.01);
          oscillator.onended = () => oscillator.disconnect();
        }
      }
    }
  } catch {
    // Continue to voice even if this browser cannot play the call signal.
  }

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, TOTAL_MS + 70);
  });

  if (ownsContext && context) {
    await context.close().catch(() => undefined);
  }
}
