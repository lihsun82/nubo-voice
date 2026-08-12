"use client";

import { useEffect, useRef } from "react";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

const AVATAR_WIDTH = 560;
const AVATAR_HEIGHT = 620;

type HologramParticle = {
  x: number;
  y: number;
  size: number;
  alpha: number;
  speed: number;
  phase: number;
};

type RenderProfile = {
  particleCount: number;
  frameInterval: number;
  dpr: number;
};

function phasePower(phase: NuboVoicePhase) {
  switch (phase) {
    case "connecting":
      return 0.62;
    case "listening":
      return 0.78;
    case "thinking":
      return 0.9;
    case "speaking":
      return 1;
    case "error":
      return 0.38;
    default:
      return 0.48;
  }
}

function getRenderProfile(): RenderProfile {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const lowCpu =
    typeof navigator.hardwareConcurrency === "number" &&
    navigator.hardwareConcurrency <= 4;
  const mobile = window.matchMedia("(pointer: coarse)").matches;

  if (reducedMotion) {
    return { particleCount: 150, frameInterval: 1000 / 20, dpr: 1 };
  }

  if (lowCpu) {
    return { particleCount: 220, frameInterval: 1000 / 30, dpr: 1 };
  }

  return mobile
    ? {
        particleCount: 300,
        frameInterval: 1000 / 30,
        dpr: Math.min(window.devicePixelRatio || 1, 1.25),
      }
    : {
        particleCount: 520,
        frameInterval: 1000 / 60,
        dpr: Math.min(window.devicePixelRatio || 1, 1.6),
      };
}

function seededRandom(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createParticles(count: number): HologramParticle[] {
  return Array.from({ length: count }, (_, index) => {
    const r1 = seededRandom(index + 1);
    const r2 = seededRandom(index + 31);
    const r3 = seededRandom(index + 67);
    const r4 = seededRandom(index + 109);
    const headParticle = r1 < 0.48;

    if (headParticle) {
      const angle = r2 * Math.PI * 2;
      const radius = 92 + r3 * 62;
      return {
        x: AVATAR_WIDTH / 2 + Math.cos(angle) * radius * 0.82,
        y: 207 + Math.sin(angle) * radius,
        size: 0.65 + r4 * 1.65,
        alpha: 0.12 + r3 * 0.42,
        speed: 0.45 + r2 * 1.4,
        phase: r4 * Math.PI * 2,
      };
    }

    const side = r2 < 0.5 ? -1 : 1;
    const spread = 70 + r3 * 170;
    const shoulderCurve = 385 + Math.pow(spread / 240, 1.45) * 128;
    return {
      x: AVATAR_WIDTH / 2 + side * spread + (r4 - 0.5) * 38,
      y: shoulderCurve + (r1 - 0.5) * 84,
      size: 0.55 + r3 * 1.6,
      alpha: 0.1 + r4 * 0.34,
      speed: 0.35 + r1 * 1.1,
      phase: r2 * Math.PI * 2,
    };
  });
}

function cyan(alpha: number) {
  return `rgba(44, 229, 255, ${Math.max(0, Math.min(1, alpha))})`;
}

function gold(alpha: number) {
  return `rgba(255, 164, 45, ${Math.max(0, Math.min(1, alpha))})`;
}

function drawHeadContour(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  alpha: number,
  lineWidth: number,
) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = cyan(alpha);
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawShoulderContour(
  ctx: CanvasRenderingContext2D,
  cx: number,
  offset: number,
  alpha: number,
  lineWidth: number,
) {
  ctx.beginPath();
  ctx.moveTo(cx - 62 - offset * 0.18, 333 + offset * 0.08);
  ctx.bezierCurveTo(
    cx - 72 - offset * 0.15,
    365 + offset * 0.12,
    cx - 135 - offset * 0.55,
    376 + offset * 0.2,
    cx - 173 - offset * 0.72,
    410 + offset * 0.25,
  );
  ctx.bezierCurveTo(
    cx - 210 - offset,
    444 + offset * 0.28,
    cx - 235 - offset,
    491 + offset * 0.2,
    cx - 245 - offset * 0.65,
    548 + offset * 0.08,
  );
  ctx.moveTo(cx + 62 + offset * 0.18, 333 + offset * 0.08);
  ctx.bezierCurveTo(
    cx + 72 + offset * 0.15,
    365 + offset * 0.12,
    cx + 135 + offset * 0.55,
    376 + offset * 0.2,
    cx + 173 + offset * 0.72,
    410 + offset * 0.25,
  );
  ctx.bezierCurveTo(
    cx + 210 + offset,
    444 + offset * 0.28,
    cx + 235 + offset,
    491 + offset * 0.2,
    cx + 245 + offset * 0.65,
    548 + offset * 0.08,
  );
  ctx.strokeStyle = cyan(alpha);
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawFaceCore(
  ctx: CanvasRenderingContext2D,
  time: number,
  power: number,
  audioLevel: number,
) {
  const cx = AVATAR_WIDTH / 2;
  const cy = 215;
  const pulse = 1 + Math.sin(time * 0.0048) * 0.025 + audioLevel * 0.08;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, 79 * pulse, 103 * pulse, 0, 0, Math.PI * 2);
  ctx.clip();

  const glow = ctx.createRadialGradient(cx, cy, 6, cx, cy, 104);
  glow.addColorStop(0, `rgba(255, 205, 76, ${0.34 + power * 0.28})`);
  glow.addColorStop(0.45, `rgba(255, 137, 33, ${0.22 + power * 0.2})`);
  glow.addColorStop(1, "rgba(255, 115, 16, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 110, cy - 125, 220, 250);

  for (let index = 0; index < 35; index += 1) {
    const y = cy - 92 + index * 5.4;
    const normalizedY = (y - cy) / 101;
    const halfWidth = Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY)) * 72;
    const wave = Math.sin(time * 0.006 + index * 0.54) * (1.2 + power * 2.8);
    const voiceWave = Math.sin(time * 0.012 + index * 0.8) * audioLevel * 8;
    ctx.beginPath();
    ctx.moveTo(cx - halfWidth, y);
    ctx.quadraticCurveTo(cx + wave + voiceWave, y + 2.5, cx + halfWidth, y);
    ctx.strokeStyle = gold(0.24 + power * 0.42);
    ctx.lineWidth = index % 5 === 0 ? 1.45 : 0.8;
    ctx.stroke();
  }

  ctx.restore();
}

function drawNeuralCore(
  ctx: CanvasRenderingContext2D,
  time: number,
  power: number,
  audioLevel: number,
) {
  const cx = AVATAR_WIDTH / 2;
  const flicker = 0.62 + Math.sin(time * 0.006) * 0.14 + audioLevel * 0.24;

  ctx.save();
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(255, 160, 35, 0.75)";
  ctx.shadowBlur = 11 + power * 9;

  for (let branch = -3; branch <= 3; branch += 1) {
    const spread = branch * 11;
    ctx.beginPath();
    ctx.moveTo(cx + spread * 0.2, 307);
    ctx.bezierCurveTo(
      cx + spread * 0.35,
      343,
      cx + spread * 0.8,
      368,
      cx + spread * 1.25,
      402,
    );
    ctx.bezierCurveTo(
      cx + spread * 1.6,
      426,
      cx + spread * 2.25,
      447,
      cx + spread * 2.8,
      480,
    );
    ctx.strokeStyle = gold((0.18 + power * 0.26) * flicker);
    ctx.lineWidth = branch === 0 ? 2.1 : 1;
    ctx.stroke();
  }

  ctx.restore();

  const chestPulse = 1 + Math.sin(time * 0.009) * 0.12 + audioLevel * 0.3;
  const chestGlow = ctx.createRadialGradient(cx, 424, 0, cx, 424, 36 * chestPulse);
  chestGlow.addColorStop(0, `rgba(235, 255, 255, ${0.72 + power * 0.18})`);
  chestGlow.addColorStop(0.25, `rgba(38, 219, 255, ${0.5 + power * 0.24})`);
  chestGlow.addColorStop(1, "rgba(35, 221, 255, 0)");
  ctx.fillStyle = chestGlow;
  ctx.beginPath();
  ctx.arc(cx, 424, 38 * chestPulse, 0, Math.PI * 2);
  ctx.fill();
}

function renderHologram(
  ctx: CanvasRenderingContext2D,
  particles: HologramParticle[],
  time: number,
  phase: NuboVoicePhase,
  audioLevel: number,
) {
  const power = phasePower(phase);
  const t = time / 1000;
  const cx = AVATAR_WIDTH / 2;
  const sway = Math.sin(t * 0.46) * (1.2 + power * 1.8);
  const breathe = Math.sin(t * 1.55) * (1.5 + power * 1.1);

  ctx.clearRect(0, 0, AVATAR_WIDTH, AVATAR_HEIGHT);
  ctx.save();
  ctx.translate(sway, breathe * 0.18);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const aura = ctx.createRadialGradient(cx, 245, 40, cx, 255, 255);
  aura.addColorStop(0, `rgba(17, 171, 255, ${0.055 + power * 0.035})`);
  aura.addColorStop(0.55, `rgba(0, 91, 189, ${0.035 + power * 0.025})`);
  aura.addColorStop(1, "rgba(0, 40, 90, 0)");
  ctx.fillStyle = aura;
  ctx.fillRect(20, 20, AVATAR_WIDTH - 40, AVATAR_HEIGHT - 50);

  for (let ring = 0; ring < 4; ring += 1) {
    const travel = ((t * (phase === "thinking" ? 26 : 13) + ring * 22) % 72) - 10;
    drawHeadContour(
      ctx,
      cx,
      207,
      101 + travel * 0.35,
      133 + travel * 0.48,
      0.055 + power * 0.04,
      0.7,
    );
  }

  ctx.shadowColor = "rgba(36, 225, 255, 0.72)";
  ctx.shadowBlur = 8 + power * 8;

  for (let layer = 0; layer < 9; layer += 1) {
    const offset = layer * 4.4;
    const alpha = Math.max(0.055, 0.34 - layer * 0.029) * (0.72 + power * 0.5);
    drawHeadContour(
      ctx,
      cx,
      207,
      87 + offset * 0.62,
      122 + offset * 0.78,
      alpha,
      layer === 0 ? 1.8 : 0.78,
    );
    drawShoulderContour(
      ctx,
      cx,
      offset,
      alpha * 0.92,
      layer === 0 ? 1.65 : 0.72,
    );
  }

  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.moveTo(cx - 56, 322);
  ctx.bezierCurveTo(cx - 47, 352, cx - 32, 372, cx - 22, 402);
  ctx.moveTo(cx + 56, 322);
  ctx.bezierCurveTo(cx + 47, 352, cx + 32, 372, cx + 22, 402);
  ctx.strokeStyle = cyan(0.38 + power * 0.24);
  ctx.lineWidth = 1.15;
  ctx.stroke();

  drawFaceCore(ctx, time, power, audioLevel);
  drawNeuralCore(ctx, time, power, audioLevel);

  const scanSpeed = phase === "thinking" ? 0.21 : phase === "speaking" ? 0.16 : 0.105;
  const scanY = 88 + ((time * scanSpeed) % 385);
  const scanGradient = ctx.createLinearGradient(110, scanY, 450, scanY);
  scanGradient.addColorStop(0, "rgba(45, 227, 255, 0)");
  scanGradient.addColorStop(0.28, cyan(0.12 + power * 0.12));
  scanGradient.addColorStop(0.5, cyan(0.46 + power * 0.28));
  scanGradient.addColorStop(0.72, cyan(0.12 + power * 0.12));
  scanGradient.addColorStop(1, "rgba(45, 227, 255, 0)");
  ctx.strokeStyle = scanGradient;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(104, scanY);
  ctx.lineTo(456, scanY);
  ctx.stroke();

  for (const particle of particles) {
    const driftX = Math.sin(t * particle.speed + particle.phase) * (2.5 + power * 2.5);
    const driftY = Math.cos(t * particle.speed * 0.72 + particle.phase) * (2 + power * 2.4);
    const sparkle = 0.45 + 0.55 * Math.sin(t * 2.1 + particle.phase);
    const alpha = particle.alpha * (0.55 + sparkle * 0.65) * (0.76 + power * 0.5);
    ctx.fillStyle = cyan(alpha);
    ctx.beginPath();
    ctx.arc(
      particle.x + driftX,
      particle.y + driftY,
      particle.size * (0.78 + power * 0.38),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  if (phase === "listening" || phase === "speaking" || phase === "thinking") {
    const ringPhase = (t * (phase === "speaking" ? 1.7 : 1.05)) % 1;
    for (let ring = 0; ring < 3; ring += 1) {
      const progress = (ringPhase + ring / 3) % 1;
      ctx.beginPath();
      ctx.ellipse(
        cx,
        209,
        100 + progress * 58,
        136 + progress * 76,
        0,
        0,
        Math.PI * 2,
      );
      ctx.strokeStyle = cyan((1 - progress) * (0.06 + power * 0.09));
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  if (phase === "error") {
    ctx.strokeStyle = "rgba(255, 92, 92, 0.34)";
    ctx.lineWidth = 1;
    for (let index = 0; index < 4; index += 1) {
      const y = 165 + index * 54 + Math.sin(t * 8 + index) * 5;
      ctx.beginPath();
      ctx.moveTo(175, y);
      ctx.lineTo(385, y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function NuboEnergyOrb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", {
      alpha: true,
      desynchronized: true,
    });
    if (!canvas || !ctx) return;

    const profile = getRenderProfile();
    const particles = createParticles(profile.particleCount);
    let phase: NuboVoicePhase = "idle";
    let audioLevel = 0;
    let targetAudioLevel = 0;
    let animationFrame = 0;
    let lastFrameAt = 0;
    let visible = document.visibilityState === "visible";

    canvas.width = Math.floor(AVATAR_WIDTH * profile.dpr);
    canvas.height = Math.floor(AVATAR_HEIGHT * profile.dpr);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.aspectRatio = `${AVATAR_WIDTH} / ${AVATAR_HEIGHT}`;
    canvas.style.display = "block";
    ctx.setTransform(profile.dpr, 0, 0, profile.dpr, 0, 0);

    const onPhase = (event: Event) => {
      const next = (
        event as CustomEvent<{ phase?: NuboVoicePhase }>
      ).detail?.phase;
      if (next) phase = next;
    };

    const onAudioLevel = (event: Event) => {
      const level = (event as CustomEvent<{ level?: number }>).detail?.level;
      if (typeof level === "number" && Number.isFinite(level)) {
        targetAudioLevel = Math.max(0, Math.min(1, level));
      }
    };

    const draw = (time: number) => {
      animationFrame = 0;
      if (!visible) return;

      audioLevel += (targetAudioLevel - audioLevel) * 0.18;
      targetAudioLevel *= 0.94;

      if (time - lastFrameAt >= profile.frameInterval) {
        lastFrameAt = time;
        renderHologram(ctx, particles, time, phase, audioLevel);
      }

      animationFrame = window.requestAnimationFrame(draw);
    };

    const onVisibilityChange = () => {
      visible = document.visibilityState === "visible";
      if (visible && !animationFrame) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    window.addEventListener("nubo-voice-phase", onPhase);
    window.addEventListener("nubo:voice-level", onAudioLevel);
    document.addEventListener("visibilitychange", onVisibilityChange);
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("nubo-voice-phase", onPhase);
      window.removeEventListener("nubo:voice-level", onAudioLevel);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <div className="nubo-energy-orb nubo-hologram-avatar" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
