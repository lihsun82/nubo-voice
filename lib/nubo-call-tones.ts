"use client";

const RING_MS = 1000;
const GAP_MS = 300;

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export async function playNuboCallTones() {
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
        const at = start + i * (RING_MS + GAP_MS) / 1000;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.16, at + 0.02);
        gain.gain.setValueAtTime(0.16, at + (RING_MS - 25) / 1000);
        gain.gain.linearRampToValueAtTime(0, at + RING_MS / 1000);
        gain.connect(context.destination);
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = 425;
        oscillator.connect(gain);
        oscillator.start(at);
        oscillator.stop(at + RING_MS / 1000 + 0.01);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      }
    }
  } catch {
    // Voice may still connect without a sound.
  }
  await wait(2 * (RING_MS + GAP_MS) + (scheduled ? 30 : 0));
  if (ownsContext && context) await context.close().catch(() => undefined);
}
