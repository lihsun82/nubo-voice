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
export const ORB_PARTICLE_COUNT = 2400;

export function createOrbParticles(): OrbParticle[] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  return Array.from({ length: ORB_PARTICLE_COUNT }, (_, index) => {
    const ratio = (index + 0.5) / ORB_PARTICLE_COUNT;
    const y = 1 - ratio * 2;
    const phi = Math.acos(Math.max(-1, Math.min(1, y)));
    const theta = index * goldenAngle + Math.random() * 0.035;
    const shellBias = Math.random();

    return {
      theta,
      phi,
      speed: 0.00042 + Math.random() * 0.00145,
      offset: index * 0.0083 + Math.random() * 6,
      size: 0.55 + Math.random() * 1.85,
      hue: Math.random(),
      // Most particles sit close to the spherical skin while some fill the volume.
      layer: shellBias < 0.72
        ? 0.9 + Math.random() * 0.14
        : 0.56 + Math.random() * 0.34,
    };
  });
}

export function getOrbPower(phase: NuboVoicePhase) {
  if (phase === "connecting") return 1.2;
  if (phase === "listening") return 1.48;
  if (phase === "thinking") return 1.9;
  if (phase === "speaking") return 3.25;
  if (phase === "error") return 0.72;
  return 1;
}
