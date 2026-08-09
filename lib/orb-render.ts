import { ORB_SIZE, type OrbParticle } from "@/lib/orb-config";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

type ProjectedParticle = {
  x: number;
  y: number;
  depth: number;
  size: number;
  alpha: number;
  tone: "blue" | "cyan" | "violet" | "gold";
  theta: number;
  layer: number;
};

const TONES = {
  blue: { fill: [82, 135, 255], glow: "#557dff" },
  cyan: { fill: [77, 225, 255], glow: "#4fe7ff" },
  violet: { fill: [176, 99, 255], glow: "#b26bff" },
  gold: { fill: [246, 191, 82], glow: "#f7c35d" },
} as const;

function particleTone(hue: number): ProjectedParticle["tone"] {
  if (hue > 0.93) return "gold";
  if (hue > 0.73) return "violet";
  if (hue > 0.28) return "cyan";
  return "blue";
}

function phaseDynamics(phase: NuboVoicePhase, time: number) {
  if (phase === "speaking") {
    const voicePulse =
      Math.sin(time * 0.009) * 0.055 +
      Math.sin(time * 0.017 + 0.8) * 0.038 +
      Math.sin(time * 0.0042 + 2.1) * 0.025;
    return {
      globalScale: 1.025 + voicePulse,
      radialJitter: 17,
      spinBoost: 2.1,
      brightness: 1.4,
      corePulse: 1.32,
    };
  }

  if (phase === "thinking") {
    return {
      globalScale: 1 + Math.sin(time * 0.0042) * 0.035,
      radialJitter: 9,
      spinBoost: 1.65,
      brightness: 1.18,
      corePulse: 1.18,
    };
  }

  if (phase === "listening") {
    return {
      globalScale: 1 + Math.sin(time * 0.0028) * 0.018,
      radialJitter: 4.5,
      spinBoost: 1.08,
      brightness: 1.06,
      corePulse: 1.06,
    };
  }

  if (phase === "connecting") {
    return {
      globalScale: 1 + Math.sin(time * 0.0035) * 0.024,
      radialJitter: 6,
      spinBoost: 1.35,
      brightness: 1.1,
      corePulse: 1.1,
    };
  }

  return {
    globalScale: 1 + Math.sin(time * 0.0019) * 0.012,
    radialJitter: 2.5,
    spinBoost: 0.82,
    brightness: 0.95,
    corePulse: 0.94,
  };
}

function projectParticles(
  particles: OrbParticle[],
  time: number,
  power: number,
  phase: NuboVoicePhase,
): ProjectedParticle[] {
  const center = ORB_SIZE / 2;
  const dynamics = phaseDynamics(phase, time);
  const baseRadius = 172;
  const spin = time * 0.00017 * dynamics.spinBoost;

  return particles.map((particle, index) => {
    const theta =
      particle.theta +
      spin +
      Math.sin(time * particle.speed + particle.offset) * 0.055;
    const phi =
      particle.phi +
      Math.sin(time * 0.00048 + particle.offset) * 0.065;

    const x3 = Math.sin(phi) * Math.cos(theta);
    const y3 = Math.cos(phi);
    const z3 = Math.sin(phi) * Math.sin(theta);
    const depth = (z3 + 1) * 0.5;
    const perspective = 0.76 + depth * 0.34;

    const individualPulse =
      Math.sin(time * (phase === "speaking" ? 0.011 : 0.0032) + particle.offset * 2.3 + index * 0.017) *
      dynamics.radialJitter;
    const wave =
      phase === "speaking"
        ? Math.sin(theta * 5 + time * 0.013) * 8 + Math.sin(phi * 4 - time * 0.01) * 5
        : 0;

    const radius =
      (baseRadius * particle.layer + individualPulse + wave) * dynamics.globalScale;
    const x = center + x3 * radius * perspective;
    const y = center + y3 * radius * perspective;
    const flicker =
      0.8 +
      Math.sin(time * (phase === "speaking" ? 0.009 : 0.003) + particle.offset) * 0.2;
    const alpha = Math.min(
      (0.26 + depth * 0.82) * flicker * dynamics.brightness * Math.min(power, 2.3),
      1,
    );

    return {
      x,
      y,
      depth,
      size:
        particle.size *
        (0.68 + depth * 1.02) *
        (phase === "speaking" ? 1.12 : 1),
      alpha,
      tone: particleTone(particle.hue),
      theta,
      layer: particle.layer,
    };
  });
}

function drawSphereVolume(
  ctx: CanvasRenderingContext2D,
  time: number,
  phase: NuboVoicePhase,
) {
  const center = ORB_SIZE / 2;
  const dynamics = phaseDynamics(phase, time);
  const radius = 174 * dynamics.globalScale;
  const volume = ctx.createRadialGradient(
    center - 48,
    center - 58,
    8,
    center,
    center,
    radius,
  );

  volume.addColorStop(0, `rgba(214,251,255,${0.34 * dynamics.corePulse})`);
  volume.addColorStop(0.13, `rgba(75,220,255,${0.23 * dynamics.corePulse})`);
  volume.addColorStop(0.38, "rgba(49,88,226,0.27)");
  volume.addColorStop(0.68, "rgba(74,35,171,0.32)");
  volume.addColorStop(0.9, "rgba(27,16,95,0.34)");
  volume.addColorStop(1, "rgba(13,18,72,0.13)");

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = volume;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(101,176,255,${phase === "speaking" ? 0.46 : 0.28})`;
  ctx.lineWidth = phase === "speaking" ? 1.55 : 1;
  ctx.shadowColor = "#70c7ff";
  ctx.shadowBlur = phase === "speaking" ? 26 : 14;
  ctx.beginPath();
  ctx.arc(center, center, radius - 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawNetwork(
  ctx: CanvasRenderingContext2D,
  projected: ProjectedParticle[],
  phase: NuboVoicePhase,
) {
  const stride = projected.length < 900 ? 6 : 9;
  const maxDistance = projected.length < 900 ? 45 : 37;
  const speaking = phase === "speaking";

  ctx.save();
  ctx.lineWidth = speaking ? 0.72 : 0.5;
  ctx.globalCompositeOperation = "lighter";

  for (let index = 0; index < projected.length; index += stride) {
    const from = projected[index];
    const candidates = [index + 7, index + 13, index + 29, index + 47];

    for (const candidate of candidates) {
      const to = projected[candidate % projected.length];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.hypot(dx, dy);
      if (distance > maxDistance) continue;

      const front = Math.min(from.depth, to.depth);
      const alpha =
        (speaking ? 0.11 : 0.065) + front * (speaking ? 0.18 : 0.12);
      ctx.strokeStyle = from.tone === "gold"
        ? `rgba(246,193,88,${alpha})`
        : from.tone === "violet"
          ? `rgba(181,111,255,${alpha})`
          : `rgba(83,207,255,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawMolecules(
  ctx: CanvasRenderingContext2D,
  projected: ProjectedParticle[],
  time: number,
  phase: NuboVoicePhase,
) {
  const speaking = phase === "speaking";
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (let index = 0; index < projected.length; index += 1) {
    const particle = projected[index];
    const tone = TONES[particle.tone];
    const localPulse =
      0.9 +
      Math.sin(time * (speaking ? 0.013 : 0.0045) + index * 0.61) *
        (speaking ? 0.28 : 0.12);
    const radius = Math.max(0.72, particle.size * localPulse);
    const alpha = Math.min(particle.alpha, 1);

    if (particle.depth > 0.58 && index % (speaking ? 5 : 8) === 0) {
      const glowRadius = (speaking ? 9 : 6) + radius * (speaking ? 5.8 : 4.2);
      const glow = ctx.createRadialGradient(
        particle.x,
        particle.y,
        0,
        particle.x,
        particle.y,
        glowRadius,
      );
      glow.addColorStop(
        0,
        `rgba(${tone.fill[0]},${tone.fill[1]},${tone.fill[2]},${0.3 * alpha})`,
      );
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${tone.fill[0]},${tone.fill[1]},${tone.fill[2]},${alpha})`;
    ctx.shadowColor = tone.glow;
    ctx.shadowBlur = particle.depth > 0.7 ? (speaking ? 16 : 9) : 4;
    ctx.fill();

    if (index % 57 === 0 && particle.depth > 0.55) {
      const satelliteAngle = particle.theta * 1.7 + time * (speaking ? 0.0011 : 0.00055);
      const orbit = 7 + particle.depth * 6;
      const sx = particle.x + Math.cos(satelliteAngle) * orbit;
      const sy = particle.y + Math.sin(satelliteAngle) * orbit * 0.56;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(${tone.fill[0]},${tone.fill[1]},${tone.fill[2]},0.35)`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(1, radius * 0.72), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawCloseOrbitLines(
  ctx: CanvasRenderingContext2D,
  time: number,
  phase: NuboVoicePhase,
) {
  const center = ORB_SIZE / 2;
  const speaking = phase === "speaking";
  const dynamics = phaseDynamics(phase, time);
  const rings = [
    { radius: 179, tilt: 0.3, speed: 0.00034, color: "77,225,255" },
    { radius: 184, tilt: 0.58, speed: -0.00029, color: "176,99,255" },
    { radius: 188, tilt: 0.78, speed: 0.00025, color: "246,191,82" },
  ];

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = speaking ? 0.95 : 0.62;

  rings.forEach((ring, ringIndex) => {
    ctx.beginPath();
    for (let step = 0; step <= 140; step += 1) {
      const ratio = step / 140;
      const angle = ratio * Math.PI * 2 + time * ring.speed * dynamics.spinBoost;
      const local =
        ring.radius * dynamics.globalScale +
        Math.sin(angle * 4 + time * 0.003 + ringIndex) * (speaking ? 5 : 2);
      const x = center + Math.cos(angle) * local;
      const y = center + Math.sin(angle) * local * ring.tilt;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(${ring.color},${speaking ? 0.28 : 0.14})`;
    ctx.setLineDash(ringIndex === 2 ? [3, 6] : []);
    ctx.stroke();
  });

  ctx.restore();
}

function drawCenterEnergy(
  ctx: CanvasRenderingContext2D,
  time: number,
  phase: NuboVoicePhase,
) {
  const center = ORB_SIZE / 2;
  const speaking = phase === "speaking";
  const dynamics = phaseDynamics(phase, time);
  const pulse =
    1 +
    Math.sin(time * (speaking ? 0.011 : 0.0032)) * (speaking ? 0.16 : 0.06);
  const radius = (speaking ? 68 : 54) * pulse;
  const glow = ctx.createRadialGradient(center, center, 0, center, center, radius);
  glow.addColorStop(0, `rgba(239,255,255,${0.88 * dynamics.corePulse})`);
  glow.addColorStop(0.12, `rgba(103,239,255,${0.64 * dynamics.corePulse})`);
  glow.addColorStop(0.38, `rgba(82,148,255,${0.3 * dynamics.corePulse})`);
  glow.addColorStop(0.7, `rgba(154,78,255,${0.16 * dynamics.corePulse})`);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  const nodeCount = speaking ? 34 : 22;
  for (let index = 0; index < nodeCount; index += 1) {
    const angle =
      index * (Math.PI * 2 / nodeCount) +
      time * (speaking ? 0.0013 : 0.00046);
    const distance =
      16 +
      (index % 6) * 7 +
      Math.sin(time * (speaking ? 0.009 : 0.002) + index) * (speaking ? 8 : 4);
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance;
    ctx.fillStyle = index % 9 === 0
      ? `rgba(250,202,93,${speaking ? 0.96 : 0.66})`
      : `rgba(181,248,255,${speaking ? 0.98 : 0.76})`;
    ctx.beginPath();
    ctx.arc(x, y, speaking ? 2.1 : 1.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function renderNuboOrb(
  ctx: CanvasRenderingContext2D,
  particles: OrbParticle[],
  time: number,
  power: number,
  phase: NuboVoicePhase,
) {
  ctx.clearRect(0, 0, ORB_SIZE, ORB_SIZE);

  drawSphereVolume(ctx, time, phase);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const projected = projectParticles(particles, time, power, phase);
  drawCloseOrbitLines(ctx, time, phase);
  drawNetwork(ctx, projected, phase);
  drawMolecules(ctx, projected, time, phase);
  drawCenterEnergy(ctx, time, phase);
  ctx.restore();
}
