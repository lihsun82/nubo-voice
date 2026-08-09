import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

export type OrbParticle = {
  theta: number;
  phi: number;
  speed: number;
  offset: number;
  size: number;
  hue: number;
  layer: number;
};

export const ORB_SIZE = 560;
export const ORB_PARTICLE_COUNT = 1500;

export function createOrbParticles(): OrbParticle[] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  return Array.from({ length: ORB_PARTICLE_COUNT }, (_, index) => {
    const ratio = (index + 0.5) / ORB_PARTICLE_COUNT;
    const y = 1 - ratio * 2;
    const phi = Math.acos(Math.max(-1, Math.min(1, y)));
    const theta = index * goldenAngle;
    const shellBias = Math.random();
    const sizeRoll = Math.random();

    // Three explicit molecular scales create visual depth instead of a field
    // of nearly identical tiny dots. Large nodes are intentionally rare.
    const size =
      sizeRoll < 0.68
        ? 0.52 + Math.random() * 0.6 // small: 0.52–1.12
        : sizeRoll < 0.93
          ? 1.55 + Math.random() * 1.05 // medium: 1.55–2.60
          : 3.15 + Math.random() * 1.45; // large: 3.15–4.60

    return {
      theta,
      phi,
      speed: 0.00034 + Math.random() * 0.00105,
      offset: index * 0.0127 + Math.random() * Math.PI * 2,
      size,
      hue: Math.random(),
      layer: shellBias < 0.84
        ? 0.91 + Math.random() * 0.09
        : 0.68 + Math.random() * 0.2,
    };
  });
}

export function getOrbPower(phase: NuboVoicePhase) {
  if (phase === "connecting") return 1.18;
  if (phase === "listening") return 1.36;
  if (phase === "thinking") return 1.78;
  if (phase === "speaking") return 2.75;
  if (phase === "error") return 0.72;
  return 1;
}
