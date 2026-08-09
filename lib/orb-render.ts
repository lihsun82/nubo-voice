import { ORB_SIZE, type OrbParticle } from "@/lib/orb-config";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

type Tone = "blue" | "cyan" | "violet" | "gold";

type ProjectedParticle = {
  x: number;
  y: number;
  depth: number;
  size: number;
  alpha: number;
  tone: Tone;
  theta: number;
};

const TONES: Record<Tone, { rgb: [number, number, number]; glow: string }> = {
  blue: { rgb: [80, 126, 255], glow: "#557cff" },
  cyan: { rgb: [73, 229, 255], glow: "#4de9ff" },
  violet: { rgb: [188, 94, 255], glow: "#bd63ff" },
  gold: { rgb: [250, 194, 76], glow: "#fac650" },
};

function particleTone(hue: number): Tone {
  if (hue > 0.93) return "gold";
  if (hue > 0.72) return "violet";
  if (hue > 0.3) return "cyan";
  return "blue";
}

function phaseDynamics(phase: NuboVoicePhase, time: number) {
  if (phase === "speaking") {
    const pulse =
      Math.sin(time * 0.0105) * 0.085 +
      Math.sin(time * 0.018 + 0.9) * 0.055 +
      Math.sin(time * 0.0047 + 2.2) * 0.035;
    return {
      scale: 1.04 + pulse,
      jitter: 24,
      spin: 2.45,
      brightness: 1.55,
      linkAlpha: 1.55,
      nodeBoost: 1.3,
    };
  }
  if (phase === "thinking") {
    return {
      scale: 1 + Math.sin(time * 0.0044) * 0.045,
      jitter: 11,
      spin: 1.9,
      brightness: 1.25,
      linkAlpha: 1.2,
      nodeBoost: 1.12,
    };
  }
  if (phase === "listening") {
    return {
      scale: 1 + Math.sin(time * 0.0028) * 0.025,
      jitter: 5,
      spin: 1.08,
      brightness: 1.08,
      linkAlpha: 1.05,
      nodeBoost: 1.03,
    };
  }
  if (phase === "connecting") {
    return {
      scale: 1 + Math.sin(time * 0.0036) * 0.03,
      jitter: 7,
      spin: 1.4,
      brightness: 1.14,
      linkAlpha: 1.08,
      nodeBoost: 1.06,
    };
  }
  if (phase === "error") {
    return {
      scale: 0.98,
      jitter: 2,
      spin: 0.45,
      brightness: 0.7,
      linkAlpha: 0.7,
      nodeBoost: 0.9,
    };
  }
  return {
    scale: 1 + Math.sin(time * 0.0018) * 0.016,
    jitter: 3,
    spin: 0.78,
    brightness: 0.98,
    linkAlpha: 0.92,
    nodeBoost: 1,
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
  const baseRadius = 178;
  const rotation = time * 0.00019 * dynamics.spin;
  const speaking = phase === "speaking";

  return particles.map((particle, index) => {
    const theta =
      particle.theta +
      rotation +
      Math.sin(time * particle.speed + particle.offset) * 0.06;
    const phi =
      particle.phi +
      Math.sin(time * 0.00043 + particle.offset) * 0.055;

    const x3 = Math.sin(phi) * Math.cos(theta);
    const y3 = Math.cos(phi);
    const z3 = Math.sin(phi) * Math.sin(theta);
    const depth = (z3 + 1) * 0.5;
    const perspective = 0.74 + depth * 0.38;

    const radialMotion =
      Math.sin(
        time * (speaking ? 0.012 : 0.0036) +
          particle.offset * 2.1 +
          index * 0.019,
      ) * dynamics.jitter;
    const speechWave = speaking
      ? Math.sin(theta * 6 + time * 0.014) * 10 +
        Math.sin(phi * 5 - time * 0.011) * 7
      : 0;

    const radius =
      (baseRadius * particle.layer + radialMotion + speechWave) * dynamics.scale;
    const x = center + x3 * radius * perspective;
    const y = center + y3 * radius * perspective;
    const twinkle =
      0.76 +
      Math.sin(time * (speaking ? 0.0105 : 0.0031) + particle.offset) * 0.24;
    const alpha = Math.min(
      (0.2 + depth * 0.82) * twinkle * dynamics.brightness * Math.min(power, 2.3),
      1,
    );

    return {
      x,
      y,
      depth,
      size:
        particle.size *
        (0.58 + depth * 1.02) *
        dynamics.nodeBoost,
      alpha,
      tone: particleTone(particle.hue),
      theta,
    };
  });
}

function drawDNAHelices(
  ctx: CanvasRenderingContext2D,
  time: number,
  phase: NuboVoicePhase,
) {
  const center = ORB_SIZE / 2;
  const dynamics = phaseDynamics(phase, time);
  const speaking = phase === "speaking";
  const radius = 176 * dynamics.scale;
  const spin = time * 0.00034 * dynamics.spin;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (let helix = 0; helix < 5; helix += 1) {
    const phaseOffset = helix * 1.19;
    const tilt = 0.5 + (helix % 3) * 0.12;
    const strandA: Array<[number, number]> = [];
    const strandB: Array<[number, number]> = [];

    for (let step = 0; step <= 96; step += 1) {
      const u = step / 96;
      const longitude = u * Math.PI * 2 + spin + phaseOffset;
      const latitude =
        Math.sin(u * Math.PI * 4 + phaseOffset + time * 0.00038) * 0.62;
      const wobble = speaking
        ? Math.sin(time * 0.012 + step * 0.24 + helix) * 5
        : Math.sin(time * 0.003 + step * 0.16 + helix) * 1.8;
      const localRadius = radius + wobble;

      const makePoint = (strandOffset: number): [number, number] => {
        const lon = longitude + strandOffset;
        const lat = latitude + Math.sin(longitude * 2 + strandOffset) * 0.08;
        const shell = Math.cos(lat);
        return [
          center + Math.cos(lon) * localRadius * shell,
          center + Math.sin(lat) * localRadius * tilt,
        ];
      };

      strandA.push(makePoint(0));
      strandB.push(makePoint(Math.PI));
    }

    const color = helix % 3 === 0
      ? "78,228,255"
      : helix % 3 === 1
        ? "183,99,255"
        : "248,194,79";

    for (const strand of [strandA, strandB]) {
      ctx.beginPath();
      strand.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = `rgba(${color},${speaking ? 0.42 : 0.24})`;
      ctx.lineWidth = speaking ? 1.05 : 0.72;
      ctx.shadowColor = helix % 3 === 1 ? "#b56bff" : "#55e9ff";
      ctx.shadowBlur = speaking ? 9 : 5;
      ctx.stroke();
    }

    for (let rung = 4; rung < strandA.length; rung += 8) {
      const [ax, ay] = strandA[rung];
      const [bx, by] = strandB[rung];
      const distance = Math.hypot(bx - ax, by - ay);
      if (distance > 110) continue;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = `rgba(${color},${speaking ? 0.25 : 0.12})`;
      ctx.lineWidth = 0.45;
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawMolecularNetwork(
  ctx: CanvasRenderingContext2D,
  projected: ProjectedParticle[],
  phase: NuboVoicePhase,
) {
  const dynamics = phaseDynamics(phase, 0);
  const speaking = phase === "speaking";
  const stride = projected.length < 1000 ? 5 : 8;
  const maxDistance = projected.length < 1000 ? 49 : 42;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (let index = 0; index < projected.length; index += stride) {
    const from = projected[index];
    const candidates = [index + 5, index + 13, index + 31, index + 59];

    for (const candidate of candidates) {
      const to = projected[candidate % projected.length];
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const distance = Math.hypot(dx, dy);
      if (distance > maxDistance) continue;

      const depth = Math.min(from.depth, to.depth);
      const baseAlpha = 0.045 + depth * 0.14;
      const alpha = baseAlpha * dynamics.linkAlpha;
      const tone = TONES[from.tone].rgb;
      ctx.strokeStyle = `rgba(${tone[0]},${tone[1]},${tone[2]},${alpha})`;
      ctx.lineWidth = speaking ? 0.78 : 0.52;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawMoleculeNodes(
  ctx: CanvasRenderingContext2D,
  projected: ProjectedParticle[],
  time: number,
  phase: NuboVoicePhase,
) {
  const speaking = phase === "speaking";

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  projected.forEach((particle, index) => {
    const tone = TONES[particle.tone];
    const pulse =
      0.92 +
      Math.sin(time * (speaking ? 0.014 : 0.0045) + index * 0.63) *
        (speaking ? 0.32 : 0.12);
    const radius = Math.max(0.62, particle.size * pulse);

    if (particle.depth > 0.56 && index % (speaking ? 4 : 7) === 0) {
      const glowRadius = 5 + radius * (speaking ? 5.2 : 3.8);
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
        `rgba(${tone.rgb[0]},${tone.rgb[1]},${tone.rgb[2]},${0.28 * particle.alpha})`,
      );
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, glowRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowColor = tone.glow;
    ctx.shadowBlur = particle.depth > 0.72 ? (speaking ? 16 : 8) : 3;
    ctx.fillStyle = `rgba(${tone.rgb[0]},${tone.rgb[1]},${tone.rgb[2]},${particle.alpha})`;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (index % 61 === 0 && particle.depth > 0.48) {
      const angle = particle.theta * 1.8 + time * (speaking ? 0.0014 : 0.00062);
      const orbit = 7 + particle.depth * 7;
      const sx = particle.x + Math.cos(angle) * orbit;
      const sy = particle.y + Math.sin(angle) * orbit * 0.58;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(${tone.rgb[0]},${tone.rgb[1]},${tone.rgb[2]},0.34)`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.85, radius * 0.65), 0, Math.PI * 2);
      ctx.fill();
    }
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
  const count = speaking ? 48 : 32;
  const speed = speaking ? 0.0017 : 0.00068;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (let index = 0; index < count; index += 1) {
    const angle = index * (Math.PI * 2 / count) + time * speed;
    const ring = 12 + (index % 7) * 6;
    const pulse = speaking ? Math.sin(time * 0.013 + index) * 10 : Math.sin(time * 0.004 + index) * 3;
    const distance = ring + pulse;
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle * 1.17) * distance * 0.8;
    const gold = index % 11 === 0;
    const rgb = gold ? TONES.gold.rgb : index % 3 === 0 ? TONES.violet.rgb : TONES.cyan.rgb;
    const nodeRadius = speaking ? 1.7 + (index % 3) * 0.65 : 1.1 + (index % 3) * 0.42;

    ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${speaking ? 0.9 : 0.68})`;
    ctx.shadowColor = gold ? TONES.gold.glow : TONES.cyan.glow;
    ctx.shadowBlur = speaking ? 15 : 8;
    ctx.beginPath();
    ctx.arc(x, y, nodeRadius, 0, Math.PI * 2);
    ctx.fill();

    if (index > 0) {
      const previousAngle = (index - 1) * (Math.PI * 2 / count) + time * speed;
      const previousRing = 12 + ((index - 1) % 7) * 6;
      const previousPulse = speaking
        ? Math.sin(time * 0.013 + index - 1) * 10
        : Math.sin(time * 0.004 + index - 1) * 3;
      const px = center + Math.cos(previousAngle) * (previousRing + previousPulse);
      const py = center + Math.sin(previousAngle * 1.17) * (previousRing + previousPulse) * 0.8;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${speaking ? 0.32 : 0.18})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
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

  const projected = projectParticles(particles, time, power, phase);

  // No filled sphere, no translucent shell, no solid core.
  // The visible globe is built only from molecules, fine links and DNA-like helices.
  drawDNAHelices(ctx, time, phase);
  drawMolecularNetwork(ctx, projected, phase);
  drawMoleculeNodes(ctx, projected, time, phase);
  drawCoreMolecules(ctx, time, phase);
}
