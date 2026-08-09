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
export const ORB_PARTICLE_COUNT = 1800;

export function createOrbParticles(): OrbParticle[] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  return Array.from({ length: ORB_PARTICLE_COUNT }, (_, index) => {
    const ratio = (index + 0.5) / ORB_PARTICLE_COUNT;
    const y = 1 - ratio * 2;
    const phi = Math.acos(Math.max(-1, Math.min(1, y)));
    const theta = index * goldenAngle + Math.random() * 0.045;

    return {
      theta,
      phi,
      speed: 0.00028 + Math.random() * 0.00118,
      offset: index * 0.009 + Math.random() * 6,
      size: 0.42 + Math.random() * 1.55,
      hue: Math.random(),
      layer: 0.78 + Math.random() * 0.26,
    };
  });
}

export function getOrbPower(phase: NuboVoicePhase) {
  if (phase === "connecting") return 1.18;
  if (phase === "listening") return 1.42;
  if (phase === "thinking") return 1.72;
  if (phase === "speaking") return 2.68;
  if (phase === "error") return 0.7;
  return 1;
}
