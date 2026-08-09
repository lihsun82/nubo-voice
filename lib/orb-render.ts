import { ORB_SIZE, type OrbParticle } from "@/lib/orb-config";

type ProjectedParticle = {
  x: number;
  y: number;
  depth: number;
  size: number;
  alpha: number;
  tone: "blue" | "cyan" | "violet" | "gold";
  theta: number;
};

const TONES = {
  blue: { fill: [102, 176, 255], glow: "#6bb6ff" },
  cyan: { fill: [125, 236, 255], glow: "#7cecff" },
  violet: { fill: [190, 135, 255], glow: "#bd8dff" },
  gold: { fill: [244, 198, 105], glow: "#f1c86b" },
} as const;

function particleTone(hue: number): ProjectedParticle["tone"] {
  if (hue > 0.93) return "gold";
  if (hue > 0.66) return "violet";
  if (hue > 0.3) return "cyan";
  return "blue";
}

function projectParticles(
  particles: OrbParticle[],
  time: number,
  power: number,
): ProjectedParticle[] {
  const center = ORB_SIZE / 2;
  const baseRadius = 176 + Math.min(power, 2.8) * 7;
  const spin = time * (0.00012 + Math.min(power, 2.8) * 0.000035);
  const breathe = 1 + Math.sin(time * 0.0018) * 0.025 * Math.min(power, 2.2);

  return particles.map((particle, index) => {
    const theta =
      particle.theta +
      spin +
      Math.sin(time * particle.speed + particle.offset) * 0.032;
    const phi =
      particle.phi +
      Math.sin(time * 0.00034 + particle.offset) * 0.045;

    const x3 = Math.sin(phi) * Math.cos(theta);
    const y3 = Math.cos(phi);
    const z3 = Math.sin(phi) * Math.sin(theta);
    const depth = (z3 + 1) * 0.5;
    const perspective = 0.72 + depth * 0.4;
    const shellNoise =
      Math.sin(time * 0.0008 + particle.offset * 1.7 + index * 0.013) * 7;
    const radius = (baseRadius * particle.layer + shellNoise) * breathe;
    const x = center + x3 * radius * perspective;
    const y = center + y3 * radius * perspective;
    const flicker = 0.72 + Math.sin(time * 0.0022 + particle.offset) * 0.28;
    const alpha = Math.min(0.16 + depth * 0.84, 1) * flicker;

    return {
      x,
      y,
      depth,
      size: particle.size * (0.55 + depth * 0.9),
      alpha,
      tone: particleTone(particle.hue),
      theta,
    };
  });
}

function drawNetwork(
  ctx: CanvasRenderingContext2D,
  projected: ProjectedParticle[],
  power: number,
) {
  const stride = projected.length < 700 ? 8 : 13;
  const maxDistance = projected.length < 700 ? 54 : 42;

  ctx.save();
  ctx.lineWidth = 0.55;
  ctx.globalCompositeOperation = "lighter";

  for (let index = 0; index < projected.length; index += stride) {
    const from = projected[index];
    const candidates = [index + 11, index + 23, index + 37];

    for (const candidate of candidates) {
      const to = projected[candidate % projected.length];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.hypot(dx, dy);
      if (distance > maxDistance) continue;

      const front = Math.min(from.depth, to.depth);
      const alpha = (0.035 + front * 0.11) * Math.min(power, 2.2);
      ctx.strokeStyle = from.tone === "gold"
        ? `rgba(232,187,91,${alpha})`
        : from.tone === "violet"
          ? `rgba(173,123,255,${alpha})`
          : `rgba(91,190,255,${alpha})`;
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
  power: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (let index = 0; index < projected.length; index += 1) {
    const particle = projected[index];
    const tone = TONES[particle.tone];
    const pulse = 0.82 + Math.sin(time * 0.003 + index * 0.71) * 0.18;
    const radius = Math.max(0.55, particle.size * pulse);
    const alpha = Math.min(particle.alpha * (0.7 + power * 0.14), 1);

    if (particle.depth > 0.62 && index % 9 === 0) {
      const glowRadius = 7 + radius * 4.5;
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
        `rgba(${tone.fill[0]},${tone.fill[1]},${tone.fill[2]},${0.22 * alpha})`,
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
    ctx.shadowBlur = particle.depth > 0.72 ? 9 + power * 2 : 3;
    ctx.fill();

    if (index % 41 === 0 && particle.depth > 0.48) {
      const satelliteAngle = particle.theta * 1.9 + time * 0.00055;
      const orbit = 7 + particle.depth * 6;
      const sx = particle.x + Math.cos(satelliteAngle) * orbit;
      const sy = particle.y + Math.sin(satelliteAngle) * orbit * 0.55;

      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(${tone.fill[0]},${tone.fill[1]},${tone.fill[2]},${0.16 + particle.depth * 0.2})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(sx, sy);
      ctx.stroke();

      ctx.fillStyle = `rgba(${tone.fill[0]},${tone.fill[1]},${tone.fill[2]},${0.5 + particle.depth * 0.4})`;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.8, radius * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawFlowRings(
  ctx: CanvasRenderingContext2D,
  time: number,
  power: number,
) {
  const center = ORB_SIZE / 2;
  const rings = [
    { radius: 184, tilt: 0.28, speed: 0.00023, alpha: 0.1, tone: "cyan" as const },
    { radius: 196, tilt: 0.54, speed: -0.00018, alpha: 0.075, tone: "violet" as const },
    { radius: 207, tilt: 0.7, speed: 0.00015, alpha: 0.06, tone: "gold" as const },
  ];

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex];
    const tone = TONES[ring.tone];
    ctx.beginPath();

    for (let step = 0; step <= 160; step += 1) {
      const ratio = step / 160;
      const angle = ratio * Math.PI * 2 + time * ring.speed + ringIndex * 1.4;
      const local = ring.radius + Math.sin(angle * 5 + time * 0.0008) * 3.5;
      const x = center + Math.cos(angle) * local;
      const y = center + Math.sin(angle) * local * ring.tilt;
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.strokeStyle = `rgba(${tone.fill[0]},${tone.fill[1]},${tone.fill[2]},${ring.alpha * Math.min(power, 2.2)})`;
    ctx.lineWidth = 0.7;
    ctx.setLineDash(ringIndex === 2 ? [3, 7] : []);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCenterEnergy(
  ctx: CanvasRenderingContext2D,
  time: number,
  power: number,
) {
  const center = ORB_SIZE / 2;
  const pulse = 0.9 + Math.sin(time * 0.0027) * 0.1;
  const radius = 62 + Math.min(power, 2.8) * 7;
  const glow = ctx.createRadialGradient(center, center, 0, center, center, radius);
  glow.addColorStop(0, `rgba(225,252,255,${0.42 * pulse})`);
  glow.addColorStop(0.2, `rgba(112,225,255,${0.22 * pulse})`);
  glow.addColorStop(0.52, `rgba(139,127,255,${0.09 * pulse})`);
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  for (let index = 0; index < 18; index += 1) {
    const angle = index * (Math.PI * 2 / 18) + time * 0.00032;
    const distance = 18 + (index % 5) * 7 + Math.sin(time * 0.001 + index) * 4;
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance;
    ctx.fillStyle = index % 7 === 0
      ? `rgba(245,204,114,${0.45 + power * 0.12})`
      : `rgba(174,241,255,${0.5 + power * 0.1})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.1 + (index % 3) * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function renderNuboOrb(
  ctx: CanvasRenderingContext2D,
  particles: OrbParticle[],
  time: number,
  power: number,
) {
  ctx.clearRect(0, 0, ORB_SIZE, ORB_SIZE);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  const projected = projectParticles(particles, time, power);
  drawFlowRings(ctx, time, power);
  drawNetwork(ctx, projected, power);
  drawMolecules(ctx, projected, time, power);
  drawCenterEnergy(ctx, time, power);

  ctx.restore();
}
