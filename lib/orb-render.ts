import { ORB_SIZE, type OrbParticle } from "@/lib/orb-config";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

type Tone = "blue" | "cyan" | "violet" | "gold";

type ProjectedParticle = {
  x: number;
  y: number;
  z: number;
  depth: number;
  size: number;
  alpha: number;
  tone: Tone;
};

const TONES: Record<Tone, { rgb: [number, number, number]; glow: string }> = {
  blue: { rgb: [78, 126, 255], glow: "#587dff" },
  cyan: { rgb: [74, 226, 255], glow: "#4de8ff" },
  violet: { rgb: [182, 95, 255], glow: "#b865ff" },
  gold: { rgb: [246, 191, 80], glow: "#f5c25a" },
};

function particleTone(hue: number): Tone {
  if (hue > 0.95) return "gold";
  if (hue > 0.78) return "violet";
  if (hue > 0.34) return "cyan";
  return "blue";
}

function dynamics(phase: NuboVoicePhase, time: number) {
  if (phase === "speaking") {
    const pulse =
      Math.sin(time * 0.0105) * 0.075 +
      Math.sin(time * 0.0175 + 0.7) * 0.042 +
      Math.sin(time * 0.0048 + 2.2) * 0.028;
    return {
      scale: 1.035 + pulse,
      spin: 2.3,
      jitter: 15,
      brightness: 1.38,
      link: 1.4,
      glow: 1.35,
    };
  }
  if (phase === "thinking") {
    return {
      scale: 1 + Math.sin(time * 0.0042) * 0.035,
      spin: 1.7,
      jitter: 8,
      brightness: 1.18,
      link: 1.16,
      glow: 1.15,
    };
  }
  if (phase === "listening") {
    return {
      scale: 1 + Math.sin(time * 0.0025) * 0.02,
      spin: 1.05,
      jitter: 3.5,
      brightness: 1.05,
      link: 1.02,
      glow: 1.02,
    };
  }
  if (phase === "connecting") {
    return {
      scale: 1 + Math.sin(time * 0.0032) * 0.024,
      spin: 1.3,
      jitter: 5,
      brightness: 1.1,
      link: 1.08,
      glow: 1.08,
    };
  }
  return {
    scale: 1 + Math.sin(time * 0.0018) * 0.012,
    spin: 0.72,
    jitter: 2,
    brightness: phase === "error" ? 0.65 : 0.96,
    link: phase === "error" ? 0.7 : 0.92,
    glow: phase === "error" ? 0.65 : 0.92,
  };
}

function rotatePoint(
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = x * cy - z * sy;
  const z1 = x * sy + z * cy;

  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y2 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;

  return { x: x1, y: y2, z: z2 };
}

function projectParticles(
  particles: OrbParticle[],
  time: number,
  power: number,
  phase: NuboVoicePhase,
): ProjectedParticle[] {
  const center = ORB_SIZE / 2;
  const d = dynamics(phase, time);
  const yaw = time * 0.00019 * d.spin;
  const pitch = 0.24 + Math.sin(time * 0.00023) * 0.08;
  const baseRadius = 182;
  const speaking = phase === "speaking";

  return particles
    .map((particle, index) => {
      const theta = particle.theta + Math.sin(time * particle.speed + particle.offset) * 0.025;
      const phi = particle.phi;

      const sx = Math.sin(phi) * Math.cos(theta);
      const sy = Math.cos(phi);
      const sz = Math.sin(phi) * Math.sin(theta);
      const rotated = rotatePoint(sx, sy, sz, yaw, pitch);

      const localPulse =
        Math.sin(
          time * (speaking ? 0.011 : 0.0031) +
            particle.offset * 1.8 +
            index * 0.021,
        ) * d.jitter;
      const wave = speaking
        ? Math.sin(theta * 5.5 + time * 0.0125) * 6
        : 0;
      const radius = (baseRadius * particle.layer + localPulse + wave) * d.scale;
      const depth = (rotated.z + 1) * 0.5;
      const perspective = 0.82 + depth * 0.28;
      const x = center + rotated.x * radius * perspective;
      const y = center + rotated.y * radius * perspective;
      const flicker =
        0.84 +
        Math.sin(time * (speaking ? 0.0105 : 0.0034) + particle.offset) * 0.16;
      const alpha = Math.min(
        (0.28 + depth * 0.66) * flicker * d.brightness * Math.min(power, 2.1),
        1,
      );

      return {
        x,
        y,
        z: rotated.z,
        depth,
        size:
          particle.size *
          (0.72 + depth * 0.64) *
          (speaking ? 1.08 : 1),
        alpha,
        tone: particleTone(particle.hue),
      };
    })
    .sort((a, b) => a.depth - b.depth);
}

function drawDNAHelix(
  ctx: CanvasRenderingContext2D,
  time: number,
  phase: NuboVoicePhase,
  axisTilt: number,
  phaseOffset: number,
  colorA: string,
  colorB: string,
) {
  const center = ORB_SIZE / 2;
  const d = dynamics(phase, time);
  const speaking = phase === "speaking";
  const radius = 186 * d.scale;
  const spin = time * 0.00024 * d.spin + phaseOffset;
  const strandA: Array<[number, number]> = [];
  const strandB: Array<[number, number]> = [];

  for (let i = 0; i <= 120; i += 1) {
    const u = i / 120;
    const longitude = u * Math.PI * 2 + spin;
    const latitude = Math.sin(u * Math.PI * 4 + spin * 0.8) * 0.42;
    const wobble = speaking ? Math.sin(time * 0.011 + i * 0.2) * 3.5 : 0;

    const pointFor = (offset: number): [number, number] => {
      const lon = longitude + offset;
      const lat = latitude + Math.sin(longitude * 2 + offset) * 0.07;
      const x3 = Math.cos(lat) * Math.cos(lon);
      const y3 = Math.sin(lat);
      const z3 = Math.cos(lat) * Math.sin(lon);
      const rotated = rotatePoint(x3, y3, z3, axisTilt, 0.38);
      const perspective = 0.86 + ((rotated.z + 1) * 0.5) * 0.2;
      return [
        center + rotated.x * (radius + wobble) * perspective,
        center + rotated.y * (radius + wobble) * perspective,
      ];
    };

    strandA.push(pointFor(0));
    strandB.push(pointFor(Math.PI));
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.shadowBlur = speaking ? 8 : 4;

  const drawStrand = (points: Array<[number, number]>, color: string) => {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = speaking ? 0.95 : 0.65;
    ctx.shadowColor = color.includes("185") ? "#b865ff" : "#50e7ff";
    ctx.stroke();
  };

  drawStrand(
    strandA,
    colorA.replace("ALPHA", speaking ? "0.36" : "0.2"),
  );
  drawStrand(
    strandB,
    colorB.replace("ALPHA", speaking ? "0.32" : "0.17"),
  );

  ctx.shadowBlur = 0;
  for (let i = 6; i < strandA.length; i += 10) {
    const a = strandA[i];
    const b = strandB[i];
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (dist > 95) continue;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = `rgba(120,185,255,${speaking ? 0.17 : 0.08})`;
    ctx.lineWidth = 0.42;
    ctx.stroke();
  }

  ctx.restore();
}

function drawNetwork(
  ctx: CanvasRenderingContext2D,
  points: ProjectedParticle[],
  phase: NuboVoicePhase,
) {
  const speaking = phase === "speaking";
  const stride = points.length < 800 ? 5 : 8;
  const maxDistance = points.length < 800 ? 53 : 44;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (let i = 0; i < points.length; i += stride) {
    const from = points[i];
    for (const offset of [7, 19, 37]) {
      const to = points[(i + offset) % points.length];
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      if (distance > maxDistance) continue;
      const tone = TONES[from.tone].rgb;
      const front = Math.min(from.depth, to.depth);
      ctx.strokeStyle = `rgba(${tone[0]},${tone[1]},${tone[2]},${(0.045 + front * 0.11) * (speaking ? 1.4 : 1)})`;
      ctx.lineWidth = speaking ? 0.72 : 0.48;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  points: ProjectedParticle[],
  time: number,
  phase: NuboVoicePhase,
) {
  const speaking = phase === "speaking";
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  points.forEach((point, index) => {
    const tone = TONES[point.tone];
    const pulse =
      0.92 +
      Math.sin(time * (speaking ? 0.013 : 0.0042) + index * 0.58) *
        (speaking ? 0.24 : 0.09);
    const radius = Math.max(0.7, point.size * pulse);

    if (point.depth > 0.62 && index % (speaking ? 8 : 11) === 0) {
      const glowRadius = 5 + radius * (speaking ? 4.8 : 3.4);
      const glow = ctx.createRadialGradient(
        point.x,
        point.y,
        0,
        point.x,
        point.y,
        glowRadius,
      );
      glow.addColorStop(
        0,
        `rgba(${tone.rgb[0]},${tone.rgb[1]},${tone.rgb[2]},${0.26 * point.alpha})`,
      );
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(point.x, point.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowColor = tone.glow;
    ctx.shadowBlur = point.depth > 0.7 ? (speaking ? 12 : 6) : 2;
    ctx.fillStyle = `rgba(${tone.rgb[0]},${tone.rgb[1]},${tone.rgb[2]},${point.alpha})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawCenterMoleculeCluster(
  ctx: CanvasRenderingContext2D,
  time: number,
  phase: NuboVoicePhase,
) {
  const center = ORB_SIZE / 2;
  const speaking = phase === "speaking";
  const count = speaking ? 24 : 18;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + time * (speaking ? 0.0012 : 0.0005);
    const distance =
      18 +
      (i % 4) * 7 +
      Math.sin(time * (speaking ? 0.012 : 0.0035) + i) * (speaking ? 6 : 2);
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle * 1.17) * distance * 0.72;
    const tone = i % 9 === 0 ? TONES.gold : i % 3 === 0 ? TONES.violet : TONES.cyan;
    const radius = speaking ? 1.8 + (i % 3) * 0.5 : 1.2 + (i % 3) * 0.4;

    ctx.shadowColor = tone.glow;
    ctx.shadowBlur = speaking ? 12 : 6;
    ctx.fillStyle = `rgba(${tone.rgb[0]},${tone.rgb[1]},${tone.rgb[2]},${speaking ? 0.95 : 0.75})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function renderNuboOrb(
  ctx: CanvasRenderingContext2D,
  particles: OrbParticle[],
  time: number,
  power: number,
  phase: NuboVoicePhase,
) {
  ctx.clearRect(0, 0, ORB_SIZE, ORB_SIZE);

  const points = projectParticles(particles, time, power, phase);

  drawDNAHelix(
    ctx,
    time,
    phase,
    0.2,
    0.1,
    "rgba(72,229,255,ALPHA)",
    "rgba(185,98,255,ALPHA)",
  );
  drawDNAHelix(
    ctx,
    time,
    phase,
    1.15,
    1.6,
    "rgba(185,98,255,ALPHA)",
    "rgba(76,170,255,ALPHA)",
  );
  drawNetwork(ctx, points, phase);
  drawNodes(ctx, points, time, phase);
  drawCenterMoleculeCluster(ctx, time, phase);
}
