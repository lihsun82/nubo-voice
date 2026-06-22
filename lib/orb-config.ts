import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

export type OrbParticle = {
  theta: number;
  phi: number;
  speed: number;
  offset: number;
  size: number;
  hue: number;
};

export const ORB_SIZE = 560;
export const ORB_PARTICLE_COUNT = 920;

export function createOrbParticles(): OrbParticle[] {
  return Array.from({ length: ORB_PARTICLE_COUNT }, (_, index) => ({
    theta: Math.random() * Math.PI * 2,
    phi: Math.acos(2 * Math.random() - 1),
    speed: 0.00035 + Math.random() * 0.00135,
    offset: index * 0.014 + Math.random() * 6,
    size: 0.45 + Math.random() * 1.65,
    hue: Math.random(),
  }));
}

export function getOrbPower(phase: NuboVoicePhase) {
  if (phase === "connecting") return 1.2;
  if (phase === "listening") return 1.38;
  if (phase === "thinking") return 1.62;
  if (phase === "speaking") return 2.92;
  if (phase === "error") return 0.68;
  return 1;
}
