"use client";

import { useEffect, useRef } from "react";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

const AVATAR_WIDTH = 560;
const AVATAR_HEIGHT = 620;

type ParticleRegion = "head" | "body" | "ambient";
type AvatarGesture = "neutral" | "nod" | "question" | "shake" | "emphasis";

type HologramParticle = {
  x: number;
  y: number;
  size: number;
  alpha: number;
  speed: number;
  phase: number;
  depth: number;
  region: ParticleRegion;
};

type RenderProfile = {
  particleCount: number;
  frameInterval: number;
  dpr: number;
};

type GestureState = {
  kind: AvatarGesture;
  startedAt: number;
  duration: number;
};

type GesturePose = {
  headX: number;
  headY: number;
  headRoll: number;
  headScaleY: number;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function cyan(alpha: number) {
  return `rgba(44, 229, 255, ${clamp01(alpha)})`;
}

function gold(alpha: number) {
  return `rgba(255, 164, 45, ${clamp01(alpha)})`;
}

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
  const mobile = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 8;
  const lowCpu = cores <= 4;

  if (reducedMotion) {
    return { particleCount: 900, frameInterval: 1000 / 20, dpr: 1 };
  }

  if (lowCpu) {
    return { particleCount: 2600, frameInterval: 1000 / 26, dpr: 1 };
  }

  if (mobile) {
    return {
      particleCount: 5400,
      frameInterval: 1000 / 30,
      dpr: Math.min(window.devicePixelRatio || 1, 1.15),
    };
  }

  return {
    // V2 desktop used 2,800. V3 targets +300% total growth while spreading
    // particles farther apart, so the avatar reads as a wider hologram cloud.
    particleCount: 11200,
    frameInterval: 1000 / 45,
    dpr: Math.min(window.devicePixelRatio || 1, 1.35),
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
    const r5 = seededRandom(index + 151);

    if (r1 < 0.27) {
      const angle = r2 * Math.PI * 2;
      const radial = 0.48 + Math.sqrt(r3) * 0.72;
      return {
        x:
          AVATAR_WIDTH / 2 +
          Math.cos(angle) * 112 * radial +
          (r5 - 0.5) * 24,
        y:
          207 +
          Math.sin(angle) * 150 * radial +
          (r4 - 0.5) * 18,
        size: 0.22 + r4 * 0.72,
        alpha: 0.055 + r3 * 0.25,
        speed: 0.3 + r2 * 1.28,
        phase: r4 * Math.PI * 2,
        depth: 0.42 + r5 * 0.58,
        region: "head",
      };
    }

    if (r1 < 0.84) {
      const verticalSeed = seededRandom(index + 233);
      const y = 314 + verticalSeed * 282;
      const vertical = clamp01((y - 314) / 282);
      const width = 84 + Math.pow(vertical, 0.7) * 188;
      const side = r2 * 2 - 1;
      const spread = side * width;
      const edgeBoost = Math.pow(Math.abs(side), 0.58);

      return {
        x:
          AVATAR_WIDTH / 2 +
          spread +
          (r5 - 0.5) * (36 + edgeBoost * 54),
        y: y + (r4 - 0.5) * 28,
        size: 0.2 + r3 * 0.72,
        alpha: 0.045 + r4 * 0.22,
        speed: 0.24 + r1 * 1.08,
        phase: r2 * Math.PI * 2,
        depth: 0.34 + r5 * 0.66,
        region: "body",
      };
    }

    const angle = r2 * Math.PI * 2;
    const radiusX = 175 + r3 * 118;
    const radiusY = 210 + r5 * 96;
    return {
      x: AVATAR_WIDTH / 2 + Math.cos(angle) * radiusX,
      y: 330 + Math.sin(angle) * radiusY,
      size: 0.16 + r4 * 0.54,
      alpha: 0.025 + r3 * 0.13,
      speed: 0.18 + r2 * 0.72,
      phase: r4 * Math.PI * 2,
      depth: 0.28 + r5 * 0.5,
      region: "ambient",
    };
  });
}

function classifyGesture(text: string): AvatarGesture {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "neutral";

  if (
    /^(你：|你:|正在處理：|正在處理:|背景聽到：|背景聽到:|NUBO已|NUBO正在|即時語音|已執行本機指令|正在開啟|已找到影片|請按下方)/i.test(
      normalized,
    )
  ) {
    return "neutral";
  }

  if (
    /[?？]|(嗎|呢|是否|是不是|要不要|怎麼|如何|為什麼|哪個|哪裡|多少|幾個|什麼|誰|何時|有沒有)/.test(
      normalized,
    )
  ) {
    return "question";
  }

  if (/(不是|不能|無法|沒辦法|不行|不要|並非|否定|錯誤)/.test(normalized)) {
    return "shake";
  }

  if (
    /^(是的|對|對的|沒錯|好的|好|可以|可以的|當然|沒問題|完成|已經|會的|收到|OK|ok|Okay|okay)/.test(
      normalized,
    )
  ) {
    return "nod";
  }

  if (/[!！]|(重點|一定|非常|特別|記得|建議|最佳|最重要)/.test(normalized)) {
    return "emphasis";
  }

  return "neutral";
}

function gestureDuration(kind: AvatarGesture) {
  switch (kind) {
    case "nod":
      return 1450;
    case "question":
      return 1800;
    case "shake":
      return 1550;
    case "emphasis":
      return 1250;
    default:
      return 0;
  }
}

function getGesturePose(
  gesture: GestureState,
  time: number,
  phase: NuboVoicePhase,
): GesturePose {
  const t = time / 1000;
  const elapsed = time - gesture.startedAt;
  const active =
    gesture.duration > 0 && elapsed >= 0 && elapsed < gesture.duration;
  const progress = active ? elapsed / gesture.duration : 1;
  const envelope = active ? Math.sin(clamp01(progress) * Math.PI) : 0;
  const speaking = phase === "speaking";

  let headX = Math.sin(t * 0.58) * 1.05;
  let headY = Math.sin(t * 1.17 + 0.8) * 0.82;
  let headRoll = Math.sin(t * 0.39) * 0.005;
  let headScaleY = 1;

  if (speaking && !active) {
    headY += Math.sin(t * 2.9) * 1.45 + Math.sin(t * 1.34) * 0.7;
    headX += Math.sin(t * 0.96 + 0.4) * 1.05;
    headRoll += Math.sin(t * 0.82 + 1.1) * 0.0065;
  }

  if (!active) return { headX, headY, headRoll, headScaleY };

  if (gesture.kind === "nod") {
    const wave = Math.sin(progress * Math.PI * 4.2) * envelope;
    headY += wave * 7.2;
    headScaleY -= Math.max(0, wave) * 0.018;
  } else if (gesture.kind === "question") {
    headY -= envelope * 6.2;
    headX += Math.sin(progress * Math.PI * 1.4) * envelope * 2.8;
    headRoll += envelope * 0.039;
  } else if (gesture.kind === "shake") {
    const wave = Math.sin(progress * Math.PI * 5.2) * envelope;
    headX += wave * 7.5;
    headRoll += wave * 0.017;
  } else if (gesture.kind === "emphasis") {
    headY -= Math.sin(progress * Math.PI * 2.3) * envelope * 4;
    headRoll += Math.sin(progress * Math.PI * 1.7) * envelope * 0.012;
  }

  return { headX, headY, headRoll, headScaleY };
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
  ctx.moveTo(cx - 60 - offset * 0.2, 330 + offset * 0.07);
  ctx.bezierCurveTo(
    cx - 82 - offset * 0.2,
    360,
    cx - 145 - offset * 0.58,
    378 + offset * 0.18,
    cx - 188 - offset * 0.8,
    418 + offset * 0.24,
  );
  ctx.bezierCurveTo(
    cx - 226 - offset,
    458 + offset * 0.22,
    cx - 252 - offset,
    516 + offset * 0.16,
    cx - 263 - offset * 0.72,
    580,
  );
  ctx.moveTo(cx + 60 + offset * 0.2, 330 + offset * 0.07);
  ctx.bezierCurveTo(
    cx + 82 + offset * 0.2,
    360,
    cx + 145 + offset * 0.58,
    378 + offset * 0.18,
    cx + 188 + offset * 0.8,
    418 + offset * 0.24,
  );
  ctx.bezierCurveTo(
    cx + 226 + offset,
    458 + offset * 0.22,
    cx + 252 + offset,
    516 + offset * 0.16,
    cx + 263 + offset * 0.72,
    580,
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
  speaking: boolean,
) {
  const cx = AVATAR_WIDTH / 2;
  const cy = 214;
  const speechRhythm = speaking
    ? 0.5 +
      Math.sin(time * 0.017) * 0.19 +
      Math.sin(time * 0.031 + 1.1) * 0.12
    : 0;
  const voiceDrive = Math.max(
    0,
    Math.min(1.4, audioLevel * 2.6 + speechRhythm),
  );
  const pulse = 1 + Math.sin(time * 0.0052) * 0.016 + voiceDrive * 0.03;
  const coreRx = 53 * pulse;
  const coreRy = 69 * pulse;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, coreRx, coreRy, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.shadowColor = `rgba(255, 145, 28, ${speaking ? 0.98 : 0.54})`;
  ctx.shadowBlur = speaking ? 26 + voiceDrive * 26 : 8 + power * 5;

  const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 74);
  glow.addColorStop(
    0,
    `rgba(255, 225, 118, ${Math.min(1, 0.4 + power * 0.15 + voiceDrive * 0.36)})`,
  );
  glow.addColorStop(
    0.43,
    `rgba(255, 143, 32, ${Math.min(0.94, 0.18 + power * 0.14 + voiceDrive * 0.35)})`,
  );
  glow.addColorStop(1, "rgba(255, 104, 12, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 80, cy - 88, 160, 176);

  for (let index = 0; index < 33; index += 1) {
    const y = cy - 60 + index * 3.75;
    const normalizedY = (y - cy) / 62;
    const halfWidth =
      Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY)) * 46;
    const wave =
      Math.sin(time * 0.006 + index * 0.54) * (0.8 + power * 1.9);
    const voiceWave =
      Math.sin(time * 0.014 + index * 0.82) * voiceDrive * 6.4;
    ctx.beginPath();
    ctx.moveTo(cx - halfWidth, y);
    ctx.quadraticCurveTo(cx + wave + voiceWave, y + 1.8, cx + halfWidth, y);
    ctx.strokeStyle = gold(
      0.18 + power * 0.23 + (speaking ? 0.2 : 0) + voiceDrive * 0.28,
    );
    ctx.lineWidth = index % 5 === 0 ? 1.2 : 0.65;
    ctx.stroke();
  }

  for (let index = 0; index < 64; index += 1) {
    const r1 = seededRandom(index + 701);
    const r2 = seededRandom(index + 743);
    const r3 = seededRandom(index + 797);
    const angle = r1 * Math.PI * 2;
    const radial = Math.sqrt(r2);
    const x = cx + Math.cos(angle) * 45 * radial;
    const y = cy + Math.sin(angle) * 58 * radial;
    const sparkle = 0.5 + 0.5 * Math.sin(time * 0.018 + index * 1.41);
    const alpha =
      (0.16 + r3 * 0.34) *
      (0.66 + sparkle * 0.44) *
      (speaking ? 1.42 + voiceDrive * 0.5 : 0.8);
    ctx.fillStyle = gold(alpha);
    ctx.beginPath();
    ctx.arc(x, y, 0.35 + r3 * 0.68, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: HologramParticle[],
  region: ParticleRegion,
  t: number,
  power: number,
  speechLift: number,
) {
  for (const particle of particles) {
    if (particle.region !== region) continue;

    const spreadBoost = region === "ambient" ? 1.4 : 1;
    const driftX =
      Math.sin(t * particle.speed + particle.phase) *
      (1.7 + power * 2.4) *
      particle.depth *
      spreadBoost;
    const driftY =
      Math.cos(t * particle.speed * 0.72 + particle.phase) *
      (1.45 + power * 2.1) *
      particle.depth *
      spreadBoost;
    const sparkle = 0.4 + 0.6 * Math.sin(t * 2.05 + particle.phase);
    const alpha =
      particle.alpha *
      (0.5 + sparkle * 0.58) *
      (0.7 + power * 0.5) *
      (0.7 + particle.depth * 0.4) *
      (1 + speechLift * 0.72);

    ctx.fillStyle = cyan(alpha);
    ctx.beginPath();
    ctx.arc(
      particle.x + driftX,
      particle.y + driftY,
      particle.size * (0.68 + power * 0.21 + speechLift * 0.05),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawNLogo(
  ctx: CanvasRenderingContext2D,
  time: number,
  power: number,
  audioLevel: number,
  speaking: boolean,
) {
  const cx = AVATAR_WIDTH / 2;
  const cy = 463;
  const rhythm = speaking
    ? 0.58 +
      Math.sin(time * 0.014) * 0.18 +
      Math.sin(time * 0.026 + 0.8) * 0.12
    : 0.12 + Math.sin(time * 0.004) * 0.04;
  const drive = clamp01(rhythm + audioLevel * 1.5);
  const glowRadius = 42 + drive * 11;

  const halo = ctx.createRadialGradient(cx, cy, 2, cx, cy, glowRadius);
  halo.addColorStop(
    0,
    `rgba(100, 244, 255, ${0.11 + power * 0.08 + drive * 0.24})`,
  );
  halo.addColorStop(
    0.5,
    `rgba(18, 184, 255, ${0.07 + power * 0.06 + drive * 0.14})`,
  );
  halo.addColorStop(1, "rgba(20, 170, 255, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.shadowColor = "rgba(38, 225, 255, 0.95)";
  ctx.shadowBlur = speaking ? 15 + drive * 16 : 8;

  const dotCount = 34;
  for (let stroke = 0; stroke < 3; stroke += 1) {
    for (let index = 0; index < dotCount; index += 1) {
      const p = index / (dotCount - 1);
      let x = 0;
      let y = 0;

      if (stroke === 0) {
        x = cx - 23;
        y = cy - 31 + p * 62;
      } else if (stroke === 1) {
        x = cx - 23 + p * 46;
        y = cy + 31 - p * 62;
      } else {
        x = cx + 23;
        y = cy - 31 + p * 62;
      }

      const seed = stroke * 100 + index;
      const jitterX = (seededRandom(seed + 881) - 0.5) * 2.8;
      const jitterY = (seededRandom(seed + 937) - 0.5) * 2.8;
      const shimmer =
        0.55 + 0.45 * Math.sin(time * 0.015 + index * 0.66 + stroke);
      const travel = speaking
        ? 0.14 * Math.sin(time * 0.024 + p * Math.PI * 5)
        : 0;
      const alpha =
        0.38 + power * 0.2 + drive * 0.36 + shimmer * 0.12 + travel;
      const size =
        0.72 + seededRandom(seed + 991) * 0.85 + (speaking ? drive * 0.22 : 0);

      ctx.fillStyle = cyan(alpha);
      ctx.beginPath();
      ctx.arc(x + jitterX, y + jitterY, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function applyHeadPose(ctx: CanvasRenderingContext2D, pose: GesturePose) {
  const cx = AVATAR_WIDTH / 2;
  const pivotY = 318;
  ctx.translate(cx, pivotY);
  ctx.translate(pose.headX, pose.headY);
  ctx.rotate(pose.headRoll);
  ctx.scale(1, pose.headScaleY);
  ctx.translate(-cx, -pivotY);
}

function renderHologram(
  ctx: CanvasRenderingContext2D,
  particles: HologramParticle[],
  time: number,
  phase: NuboVoicePhase,
  audioLevel: number,
  gesture: GestureState,
) {
  const power = phasePower(phase);
  const t = time / 1000;
  const cx = AVATAR_WIDTH / 2;
  const speaking = phase === "speaking";
  const speechLift = speaking
    ? 0.5 +
      Math.sin(time * 0.012) * 0.1 +
      Math.sin(time * 0.021 + 0.7) * 0.08 +
      audioLevel * 0.7
    : 0;
  const bodySway = Math.sin(t * 0.43) * (1.5 + power * 1.8);
  const breathe = Math.sin(t * 1.36) * (1.5 + power * 1.05);
  const bodyRoll = Math.sin(t * 0.29 + 0.5) * 0.0045;
  const pose = getGesturePose(gesture, time, phase);

  ctx.clearRect(0, 0, AVATAR_WIDTH, AVATAR_HEIGHT);
  ctx.save();
  ctx.translate(cx, 390);
  ctx.rotate(bodyRoll);
  ctx.translate(-cx, -390);
  ctx.translate(bodySway, breathe * 0.2);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const aura = ctx.createRadialGradient(cx, 270, 42, cx, 300, 302);
  aura.addColorStop(
    0,
    `rgba(17, 171, 255, ${0.052 + power * 0.035 + speechLift * 0.055})`,
  );
  aura.addColorStop(
    0.58,
    `rgba(0, 91, 189, ${0.03 + power * 0.024 + speechLift * 0.028})`,
  );
  aura.addColorStop(1, "rgba(0, 40, 90, 0)");
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, AVATAR_WIDTH, AVATAR_HEIGHT);

  drawParticles(ctx, particles, "ambient", t, power, speechLift * 0.75);

  ctx.shadowColor = "rgba(36, 225, 255, 0.72)";
  ctx.shadowBlur = 8 + power * 8 + speechLift * 5;
  for (let layer = 0; layer < 8; layer += 1) {
    const offset = layer * 5.2;
    const alpha =
      Math.max(0.045, 0.28 - layer * 0.027) *
      (0.7 + power * 0.46 + speechLift * 0.16);
    drawShoulderContour(
      ctx,
      cx,
      offset,
      alpha,
      layer === 0 ? 1.45 : 0.62,
    );
  }
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.moveTo(cx - 56, 322);
  ctx.bezierCurveTo(cx - 47, 353, cx - 31, 377, cx - 20, 408);
  ctx.moveTo(cx + 56, 322);
  ctx.bezierCurveTo(cx + 47, 353, cx + 31, 377, cx + 20, 408);
  ctx.strokeStyle = cyan(0.32 + power * 0.22 + speechLift * 0.13);
  ctx.lineWidth = 1;
  ctx.stroke();

  drawParticles(ctx, particles, "body", t, power, speechLift);
  drawNLogo(ctx, time, power, audioLevel, speaking);

  ctx.save();
  applyHeadPose(ctx, pose);

  for (let ring = 0; ring < 4; ring += 1) {
    const travel =
      ((t * (phase === "thinking" ? 25 : speaking ? 18 : 12) + ring * 22) %
        76) -
      12;
    drawHeadContour(
      ctx,
      cx,
      207,
      106 + travel * 0.4,
      140 + travel * 0.52,
      0.04 + power * 0.035 + speechLift * 0.025,
      0.62,
    );
  }

  ctx.shadowColor = "rgba(36, 225, 255, 0.74)";
  ctx.shadowBlur = 8 + power * 8 + speechLift * 6;
  for (let layer = 0; layer < 8; layer += 1) {
    const offset = layer * 5;
    const alpha =
      Math.max(0.046, 0.3 - layer * 0.028) *
      (0.7 + power * 0.5 + speechLift * 0.15);
    drawHeadContour(
      ctx,
      cx,
      207,
      89 + offset * 0.7,
      124 + offset * 0.82,
      alpha,
      layer === 0 ? 1.55 : 0.66,
    );
  }
  ctx.shadowBlur = 0;

  drawParticles(ctx, particles, "head", t, power, speechLift);
  drawFaceCore(ctx, time, power, audioLevel, speaking);
  ctx.restore();

  const scanSpeed = phase === "thinking" ? 0.21 : speaking ? 0.17 : 0.105;
  const scanY = 72 + ((time * scanSpeed) % 450);
  const scanGradient = ctx.createLinearGradient(82, scanY, 478, scanY);
  scanGradient.addColorStop(0, "rgba(45, 227, 255, 0)");
  scanGradient.addColorStop(
    0.5,
    cyan(0.32 + power * 0.24 + speechLift * 0.18),
  );
  scanGradient.addColorStop(1, "rgba(45, 227, 255, 0)");
  ctx.strokeStyle = scanGradient;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(78, scanY);
  ctx.lineTo(482, scanY);
  ctx.stroke();

  if (phase === "error") {
    ctx.strokeStyle = "rgba(255, 92, 92, 0.3)";
    for (let index = 0; index < 4; index += 1) {
      const y = 160 + index * 62 + Math.sin(t * 8 + index) * 5;
      ctx.beginPath();
      ctx.moveTo(160, y);
      ctx.lineTo(400, y);
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
    let gesture: GestureState = {
      kind: "neutral",
      startedAt: 0,
      duration: 0,
    };
    let lastTranscript = "";

    canvas.width = Math.floor(AVATAR_WIDTH * profile.dpr);
    canvas.height = Math.floor(AVATAR_HEIGHT * profile.dpr);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.aspectRatio = `${AVATAR_WIDTH} / ${AVATAR_HEIGHT}`;
    canvas.style.display = "block";
    ctx.setTransform(profile.dpr, 0, 0, profile.dpr, 0, 0);

    const setGestureFromText = (text: string) => {
      const normalized = text.trim();
      if (!normalized || normalized === lastTranscript) return;
      lastTranscript = normalized;
      const kind = classifyGesture(normalized);
      gesture = {
        kind,
        startedAt: performance.now(),
        duration: gestureDuration(kind),
      };
    };

    const onPhase = (event: Event) => {
      const next = (event as CustomEvent<{ phase?: NuboVoicePhase }>).detail
        ?.phase;
      if (next) phase = next;
    };

    const onAudioLevel = (event: Event) => {
      const level = (event as CustomEvent<{ level?: number }>).detail?.level;
      if (typeof level === "number" && Number.isFinite(level)) {
        targetAudioLevel = clamp01(level);
      }
    };

    const onAssistantText = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text;
      if (typeof text === "string") setGestureFromText(text);
    };

    const transcriptObserver = new MutationObserver(() => {
      const transcript = document.querySelector<HTMLElement>(".voice-transcript");
      if (transcript?.textContent) setGestureFromText(transcript.textContent);
    });
    transcriptObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    const draw = (time: number) => {
      animationFrame = 0;
      if (!visible) return;

      audioLevel += (targetAudioLevel - audioLevel) * 0.2;
      targetAudioLevel *= 0.9;

      if (time - lastFrameAt >= profile.frameInterval) {
        lastFrameAt = time;
        renderHologram(ctx, particles, time, phase, audioLevel, gesture);
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
    window.addEventListener("nubo:assistant-text", onAssistantText);
    document.addEventListener("visibilitychange", onVisibilityChange);
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      transcriptObserver.disconnect();
      window.removeEventListener("nubo-voice-phase", onPhase);
      window.removeEventListener("nubo:voice-level", onAudioLevel);
      window.removeEventListener("nubo:assistant-text", onAssistantText);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <div className="nubo-energy-orb nubo-hologram-avatar" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
