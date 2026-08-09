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
  sourceIndex: number;
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

function phaseDynamics(phase: NuboVoicePhase, time: number) {
  if (phase === "speaking") {
    const pulse =
      Math.sin(time * 0.0105) * 0.07 +
      Math.sin(time * 0.017 + 0.7) * 0.04 +
      Math.sin(time * 0.0046 + 2.2) * 0.028;
    return {
      scale: 1.035 + pulse,
      spin: 2.25,
      jitter: 15,
      brightness: 1.34,
      link: 1.35,
      glow: 1.3,
    };
  }
  if (phase === "thinking") {
    return {
      scale: 1 + Math.sin(time * 0.0042) * 0.032,
      spin: 1.65,
      jitter: 8,
      brightness: 1.16,
      link: 1.14,
      glow: 1.12,
    };
  }
  if (phase === "listening") {
    return {
      scale: 1 + Math.sin(time * 0.0025) * 0.018,
      spin: 1.05,
      jitter: 3.5,
      brightness: 1.04,
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

function rotateXYZ(
  x: number,
  y: number,
  z: number,
  yaw: number,
  pitch: number,
  roll: number,
) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  let rx = x * cy - z * sy;
  let rz = x * sy + z * cy;
  let ry = y;

  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const py = ry * cp - rz * sp;
  const pz = ry * sp + rz * cp;
  ry = py;
  rz = pz;

  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const qx = rx * cr - ry * sr;
  const qy = rx * sr + ry * cr;

  return { x: qx, y: qy, z: rz };
}

function projectParticles(
  particles: OrbParticle[],
  time: number,
  power: number,
  phase: NuboVoicePhase,
): ProjectedParticle[] {
  const center = ORB_SIZE / 2;
  const d = phaseDynamics(phase, time);
  const yaw = time * 0.0002 * d.spin;
  const pitch = 0.48 + Math.sin(time * 0.00031) * 0.22;
  const roll = -0.18 + Math.sin(time * 0.00023 + 1.1) * 0.16;
  const baseRadius = 180;
  const cameraDistance = 3.55;
  const speaking = phase === "speaking";

  return particles
    .map((particle, index) => {
      const theta =
        particle.theta +
        Math.sin(time * particle.speed + particle.offset) * 0.026;
      const phi =
        particle.phi +
        Math.sin(time * 0.0004 + particle.offset) * 0.018;

      const sx = Math.sin(phi) * Math.cos(theta);
      const sy = Math.cos(phi);
      const sz = Math.sin(phi) * Math.sin(theta);
      const rotated = rotateXYZ(sx, sy, sz, yaw, pitch, roll);

      const localPulse =
        Math.sin(
          time * (speaking ? 0.011 : 0.0031) +
            particle.offset * 1.8 +
            index * 0.021,
        ) * d.jitter;
      const speechWave = speaking
        ? Math.sin(theta * 5.5 + time * 0.0125) * 5.5 +
          Math.sin(phi * 4.3 - time * 0.0102) * 4
        : 0;

      const radius =
        (baseRadius * particle.layer + localPulse + speechWave) * d.scale;

      const zCamera = rotated.z + cameraDistance;
      const perspective = cameraDistance / zCamera;
      const x = center + rotated.x * radius * perspective;
      const y = center + rotated.y * radius * perspective;
      const depth = (rotated.z + 1) * 0.5;

      const twinkle =
        0.86 +
        Math.sin(
          time * (speaking ? 0.0108 : 0.0035) + particle.offset,
        ) * 0.14;
      const rearFade = 0.5 + depth * 0.5;
      const alpha = Math.min(
        (0.3 + depth * 0.62) *
          twinkle *
          d.brightness *
          rearFade *
          Math.min(power, 2.05),
        1,
      );

      return {
        x,
        y,
        z: rotated.z,
        depth,
        size:
          particle.size *
          (0.72 + depth * 0.62) *
          (speaking ? 1.07 : 1),
        alpha,
        tone: particleTone(particle.hue),
        sourceIndex: index,
      };
    })
    .sort((a, b) => a.z - b.z);
}

function drawLatitudeLongitudeGrid(
  ctx: CanvasRenderingContext2D,
  time: number,
  phase: NuboVoicePhase,
) {
  const center = ORB_SIZE / 2;
  const d = phaseDynamics(phase, time);
  const yaw = time * 0.0002 * d.spin;
  const pitch = 0.48 + Math.sin(time * 0.00031) * 0.22;
  const roll = -0.18 + Math.sin(time * 0.00023 + 1.1) * 0.16;
  const cameraDistance = 3.55;
  const radius = 181 * d.scale;
  const speaking = phase === "speaking";

  const project = (x: number, y: number, z: number) => {
    const r = rotateXYZ(x, y, z, yaw, pitch, roll);
    const perspective = cameraDistance / (r.z + cameraDistance);
    return {
      x: center + r.x * radius * perspective,
      y: center + r.y * radius * perspective,
      z: r.z,
    };
  };

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (let latIndex = -3; latIndex <= 3; latIndex += 1) {
    const latitude = (latIndex / 4) * (Math.PI / 2);
    ctx.beginPath();
    for (let step = 0; step <= 120; step += 1) {
      const lon = (step / 120) * Math.PI * 2;
      const x = Math.cos(latitude) * Math.cos(lon);
      const y = Math.sin(latitude);
      const z = Math.cos(latitude) * Math.sin(lon);
      const p = project(x, y, z);
      if (step === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = `rgba(93,183,255,${speaking ? 0.12 : 0.07})`;
    ctx.lineWidth = 0.45;
    ctx.stroke();
  }

  for (let lonIndex = 0; lonIndex < 8; lonIndex += 1) {
    const longitude = (lonIndex / 8) * Math.PI * 2;
    ctx.beginPath();
    for (let step = 0; step <= 100; step += 1) {
      const lat = -Math.PI / 2 + (step / 100) * Math.PI;
      const x = Math.cos(lat) * Math.cos(longitude);
      const y = Math.sin(lat);
      const z = Math.cos(lat) * Math.sin(longitude);
      const p = project(x, y, z);
      if (step === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = `rgba(181,100,255,${speaking ? 0.11 : 0.06})`;
    ctx.lineWidth = 0.42;
    ctx.stroke();
  }

  ctx.restore();
}

function drawDNAHelix(
  ctx: CanvasRenderingContext2D,
  time: number,
  phase: NuboVoicePhase,
  axisYaw: number,
  axisPitch: number,
  phaseOffset: number,
  colorA: string,
  colorB: string,
) {
  const center = ORB_SIZE / 2;
  const d = phaseDynamics(phase, time);
  const speaking = phase === "speaking";
  const radius = 186 * d.scale;
  const cameraDistance = 3.55;
  const spin = time * 0.00025 * d.spin + phaseOffset;
  const strandA: Array<[number, number, number]> = [];
  const strandB: Array<[number, number, number]> = [];

  for (let i = 0; i <= 140; i += 1) {
    const u = i / 140;
    const lon = u * Math.PI * 2 + spin;
    const lat = Math.sin(u * Math.PI * 4 + spin * 0.7) * 0.52;
    const wobble = speaking
      ? Math.sin(time * 0.011 + i * 0.18) * 3.2
      : Math.sin(time * 0.0032 + i * 0.12) * 1.1;

    const pointFor = (offset: number): [number, number, number] => {
      const localLon = lon + offset;
      const x = Math.cos(lat) * Math.cos(localLon);
      const y = Math.sin(lat);
      const z = Math.cos(lat) * Math.sin(localLon);
      const r = rotateXYZ(
        x,
        y,
        z,
        axisYaw + time * 0.00008 * d.spin,
        axisPitch,
        0.22,
      );
      const perspective = cameraDistance / (r.z + cameraDistance);
      return [
        center + r.x * (radius + wobble) * perspective,
        center + r.y * (radius + wobble) * perspective,
        r.z,
      ];
    };

    strandA.push(pointFor(0));
    strandB.push(pointFor(Math.PI));
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  const drawStrand = (
    points: Array<[number, number, number]>,
    color: string,
  ) => {
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1];
      const b = points[i];
      const depth = ((a[2] + b[2]) * 0.5 + 1) * 0.5;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = color.replace(
        "ALPHA",
        String((speaking ? 0.22 : 0.12) + depth * (speaking ? 0.2 : 0.11)),
      );
      ctx.lineWidth = (speaking ? 0.9 : 0.62) * (0.75 + depth * 0.35);
      ctx.stroke();
    }
  };

  drawStrand(strandA, colorA);
  drawStrand(strandB, colorB);

  for (let i = 8; i < strandA.length; i += 12) {
    const a = strandA[i];
    const b = strandB[i];
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (dist > 115) continue;
    const depth = ((a[2] + b[2]) * 0.5 + 1) * 0.5;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = `rgba(110,190,255,${(speaking ? 0.12 : 0.06) + depth * 0.08})`;
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
  const stride = points.length < 800 ? 6 : 9;
  const maxDistance = points.length < 800 ? 50 : 43;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (let i = 0; i < points.length; i += stride) {
    const from = points[i];
    for (const offset of [9, 23, 41]) {
      const to = points[(i + offset) % points.length];
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      if (distance > maxDistance) continue;
      const tone = TONES[from.tone].rgb;
      const front = Math.min(from.depth, to.depth);
      const depthGap = Math.abs(from.z - to.z);
      if (depthGap > 0.62) continue;
      ctx.strokeStyle = `rgba(${tone[0]},${tone[1]},${tone[2]},${(0.035 + front * 0.1) * (speaking ? 1.35 : 1)})`;
      ctx.lineWidth = speaking ? 0.68 : 0.46;
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
      0.94 +
      Math.sin(time * (speaking ? 0.013 : 0.0042) + index * 0.58) *
        (speaking ? 0.2 : 0.07);
    const radius = Math.max(0.62, point.size * pulse);

    if (point.depth > 0.7 && index % (speaking ? 11 : 15) === 0) {
      const glowRadius = 4.5 + radius * (speaking ? 4.2 : 3.1);
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
        `rgba(${tone.rgb[0]},${tone.rgb[1]},${tone.rgb[2]},${0.22 * point.alpha})`,
      );
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(point.x, point.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowColor = tone.glow;
    ctx.shadowBlur = point.depth > 0.72 ? (speaking ? 10 : 5) : 1.5;
    ctx.fillStyle = `rgba(${tone.rgb[0]},${tone.rgb[1]},${tone.rgb[2]},${point.alpha})`;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawCoreMolecules(
  ctx: CanvasRenderingContext2D,
  time: number,
  phase: NuboVoicePhase,
) {
  const center = ORB_SIZE / 2;
  const speaking = phase === "speaking";
  const count = speaking ? 20 : 14;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (let i = 0; i < count; i += 1) {
    const angle =
      (i / count) * Math.PI * 2 +
      time * (speaking ? 0.0012 : 0.0005);
    const distance =
      16 +
      (i % 4) * 7 +
      Math.sin(time * (speaking ? 0.012 : 0.0035) + i) *
        (speaking ? 5 : 2);
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle * 1.17) * distance * 0.72;
    const tone =
      i % 8 === 0 ? TONES.gold : i % 3 === 0 ? TONES.violet : TONES.cyan;
    const radius = speaking
      ? 1.6 + (i % 3) * 0.45
      : 1.05 + (i % 3) * 0.36;

    ctx.shadowColor = tone.glow;
    ctx.shadowBlur = speaking ? 10 : 5;
    ctx.fillStyle = `rgba(${tone.rgb[0]},${tone.rgb[1]},${tone.rgb[2]},${speaking ? 0.92 : 0.72})`;
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

  drawLatitudeLongitudeGrid(ctx, time, phase);
  drawDNAHelix(
    ctx,
    time,
    phase,
    0.22,
    0.45,
    0.1,
    "rgba(72,229,255,ALPHA)",
    "rgba(185,98,255,ALPHA)",
  );
  drawDNAHelix(
    ctx,
    time,
    phase,
    1.3,
    -0.28,
    1.8,
    "rgba(185,98,255,ALPHA)",
    "rgba(76,170,255,ALPHA)",
  );
  drawNetwork(ctx, points, phase);
  drawNodes(ctx, points, time, phase);
  drawCoreMolecules(ctx, time, phase);
}
