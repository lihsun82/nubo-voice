"use client";

import { useEffect, useRef } from "react";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

const AVATAR_WIDTH = 560;
const AVATAR_HEIGHT = 620;

type ParticleRegion = "head" | "body";
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
    return { particleCount: 520, frameInterval: 1000 / 20, dpr: 1 };
  }

  if (lowCpu) {
    return { particleCount: 1200, frameInterval: 1000 / 30, dpr: 1 };
  }

  return mobile
    ? {
        particleCount: 1650,
        frameInterval: 1000 / 30,
        dpr: Math.min(window.devicePixelRatio || 1, 1.2),
      }
    : {
        particleCount: 2800,
        frameInterval: 1000 / 60,
        dpr: Math.min(window.devicePixelRatio || 1, 1.45),
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
    const headParticle = r1 < 0.34;

    if (headParticle) {
      const angle = r2 * Math.PI * 2;
      const radial = Math.sqrt(r3);
      const shellBias = 0.58 + radial * 0.42;
      return {
        x:
          AVATAR_WIDTH / 2 +
          Math.cos(angle) * 92 * shellBias +
          (r5 - 0.5) * 7,
        y: 207 + Math.sin(angle) * 126 * shellBias + (r4 - 0.5) * 7,
        size: 0.32 + r4 * 0.88,
        alpha: 0.085 + r3 * 0.34,
        speed: 0.38 + r2 * 1.35,
        phase: r4 * Math.PI * 2,
        depth: 0.45 + r5 * 0.55,
        region: "head",
      };
    }

    const y = 328 + r1 * 240;
    const vertical = Math.max(0, Math.min(1, (y - 328) / 240));
    const shoulderWidth = 72 + Math.pow(vertical, 0.72) * 178;
    const x = AVATAR_WIDTH / 2 + (r2 * 2 - 1) * shoulderWidth;
    const edgeBias = Math.pow(Math.abs(r2 * 2 - 1), 0.7);

    return {
      x: x + (r5 - 0.5) * (18 + edgeBias * 22),
      y: y + (r4 - 0.5) * 15,
      size: 0.28 + r3 * 0.82,
      alpha: 0.07 + r4 * 0.3,
      speed: 0.3 + r1 * 1.05,
      phase: r2 * Math.PI * 2,
      depth: 0.38 + r5 * 0.62,
      region: "body",
    };
  });
}

function cyan(alpha: number) {
  return `rgba(44, 229, 255, ${Math.max(0, Math.min(1, alpha))})`;
}

function gold(alpha: number) {
  return `rgba(255, 164, 45, ${Math.max(0, Math.min(1, alpha))})`;
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

  if (/(不是|不能|無法|沒辦法|不行|不要|別|並非|否定|錯誤|沒有辦法)/.test(normalized)) {
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
      return 1850;
    case "shake":
      return 1600;
    case "emphasis":
      return 1250;
    default:
      return 0;
  }
}

function easeEnvelope(progress: number) {
  const clamped = Math.max(0, Math.min(1, progress));
  return Math.sin(clamped * Math.PI);
}

function getGesturePose(
  gesture: GestureState,
  time: number,
  phase: NuboVoicePhase,
): GesturePose {
  const t = time / 1000;
  const elapsed = time - gesture.startedAt;
  const active = gesture.duration > 0 && elapsed >= 0 && elapsed < gesture.duration;
  const progress = active ? elapsed / gesture.duration : 1;
  const envelope = active ? easeEnvelope(progress) : 0;
  const speaking = phase === "speaking";

  let headX = Math.sin(t * 0.62) * 0.8;
  let headY = Math.sin(t * 1.24 + 0.8) * 0.65;
  let headRoll = Math.sin(t * 0.43) * 0.0045;
  let headScaleY = 1;

  if (speaking && !active) {
    headY += Math.sin(t * 3.05) * 1.35 + Math.sin(t * 1.37) * 0.6;
    headX += Math.sin(t * 1.08 + 0.4) * 0.9;
    headRoll += Math.sin(t * 0.88 + 1.1) * 0.006;
  }

  if (!active) {
    return { headX, headY, headRoll, headScaleY };
  }

  switch (gesture.kind) {
    case "nod": {
      const nodWave = Math.sin(progress * Math.PI * 4.2) * envelope;
      headY += nodWave * 7.2;
      headScaleY -= Math.max(0, nodWave) * 0.018;
      headRoll += Math.sin(progress * Math.PI * 2) * envelope * 0.006;
      break;
    }
    case "question": {
      headY -= envelope * 6.2;
      headX += Math.sin(progress * Math.PI * 1.4) * envelope * 2.7;
      headRoll += envelope * 0.038 + Math.sin(progress * Math.PI * 2) * 0.009;
      headScaleY += envelope * 0.012;
      break;
    }
    case "shake": {
      const shakeWave = Math.sin(progress * Math.PI * 5.2) * envelope;
      headX += shakeWave * 7.4;
      headRoll += shakeWave * 0.017;
      break;
    }
    case "emphasis": {
      headY -= Math.sin(progress * Math.PI * 2.3) * envelope * 3.8;
      headRoll += Math.sin(progress * Math.PI * 1.7) * envelope * 0.012;
      break;
    }
    default:
      break;
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
  speaking: boolean,
) {
  const cx = AVATAR_WIDTH / 2;
  const cy = 215;
  const speechRhythm = speaking
    ? 0.52 + Math.sin(time * 0.017) * 0.2 + Math.sin(time * 0.031 + 1.1) * 0.13
    : 0;
  const voiceDrive = Math.max(0, Math.min(1.35, audioLevel * 2.7 + speechRhythm));
  const pulse = 1 + Math.sin(time * 0.0052) * 0.018 + voiceDrive * 0.035;
  const coreRx = 56 * pulse;
  const coreRy = 74 * pulse;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, coreRx, coreRy, 0, 0, Math.PI * 2);
  ctx.clip();

  ctx.shadowColor = `rgba(255, 145, 28, ${speaking ? 0.96 : 0.56})`;
  ctx.shadowBlur = speaking ? 24 + voiceDrive * 24 : 9 + power * 5;

  const glow = ctx.createRadialGradient(cx, cy, 3, cx, cy, 78);
  glow.addColorStop(
    0,
    `rgba(255, 224, 116, ${Math.min(1, 0.42 + power * 0.16 + voiceDrive * 0.34)})`,
  );
  glow.addColorStop(
    0.42,
    `rgba(255, 143, 32, ${Math.min(0.92, 0.2 + power * 0.15 + voiceDrive * 0.34)})`,
  );
  glow.addColorStop(1, "rgba(255, 104, 12, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 82, cy - 92, 164, 184);

  for (let index = 0; index < 29; index += 1) {
    const y = cy - 65 + index * 4.6;
    const normalizedY = (y - cy) / 67;
    const halfWidth = Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY)) * 49;
    const wave = Math.sin(time * 0.006 + index * 0.54) * (0.9 + power * 2.1);
    const voiceWave = Math.sin(time * 0.014 + index * 0.82) * voiceDrive * 6.8;
    ctx.beginPath();
    ctx.moveTo(cx - halfWidth, y);
    ctx.quadraticCurveTo(cx + wave + voiceWave, y + 2, cx + halfWidth, y);
    ctx.strokeStyle = gold(
      Math.min(1, 0.2 + power * 0.24 + (speaking ? 0.18 : 0) + voiceDrive * 0.28),
    );
    ctx.lineWidth = index % 5 === 0 ? 1.35 : 0.72;
    ctx.stroke();
  }

  for (let index = 0; index < 48; index += 1) {
    const r1 = seededRandom(index + 701);
    const r2 = seededRandom(index + 743);
    const r3 = seededRandom(index + 797);
    const angle = r1 * Math.PI * 2;
    const radial = Math.sqrt(r2);
    const x = cx + Math.cos(angle) * 48 * radial;
    const y = cy + Math.sin(angle) * 62 * radial;
    const sparkle = 0.55 + 0.45 * Math.sin(time * 0.018 + index * 1.41);
    const alpha =
      (0.18 + r3 * 0.34) *
      (0.68 + sparkle * 0.42) *
      (speaking ? 1.35 + voiceDrive * 0.45 : 0.82);
    ctx.fillStyle = gold(alpha);
    ctx.beginPath();
    ctx.arc(x, y, 0.42 + r3 * 0.72 + voiceDrive * 0.1, 0, Math.PI * 2);
    ctx.fill();
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

function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: HologramParticle[],
  region: ParticleRegion,
  t: number,
  power: number,
) {
  for (const particle of particles) {
    if (particle.region !== region) continue;
    const driftX =
      Math.sin(t * particle.speed + particle.phase) * (1.25 + power * 1.75) * particle.depth;
    const driftY =
      Math.cos(t * particle.speed * 0.72 + particle.phase) *
      (1.05 + power * 1.65) *
      particle.depth;
    const sparkle = 0.42 + 0.58 * Math.sin(t * 2.15 + particle.phase);
    const alpha =
      particle.alpha *
      (0.52 + sparkle * 0.58) *
      (0.72 + power * 0.48) *
      (0.72 + particle.depth * 0.38);
    ctx.fillStyle = cyan(alpha);
    ctx.beginPath();
    ctx.arc(
      particle.x + driftX,
      particle.y + driftY,
      particle.size * (0.72 + power * 0.24),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function applyHeadPose(
  ctx: CanvasRenderingContext2D,
  pose: GesturePose,
) {
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
  const bodySway = Math.sin(t * 0.46) * (1.2 + power * 1.55);
  const breathe = Math.sin(t * 1.42) * (1.35 + power * 0.9);
  const bodyRoll = Math.sin(t * 0.31 + 0.5) * 0.004;
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

  const aura = ctx.createRadialGradient(cx, 245, 40, cx, 255, 255);
  aura.addColorStop(0, `rgba(17, 171, 255, ${0.055 + power * 0.035})`);
  aura.addColorStop(0.55, `rgba(0, 91, 189, ${0.035 + power * 0.025})`);
  aura.addColorStop(1, "rgba(0, 40, 90, 0)");
  ctx.fillStyle = aura;
  ctx.fillRect(20, 20, AVATAR_WIDTH - 40, AVATAR_HEIGHT - 50);

  ctx.shadowColor = "rgba(36, 225, 255, 0.72)";
  ctx.shadowBlur = 8 + power * 7;

  for (let layer = 0; layer < 9; layer += 1) {
    const offset = layer * 4.4;
    const alpha = Math.max(0.05, 0.32 - layer * 0.028) * (0.72 + power * 0.46);
    drawShoulderContour(
      ctx,
      cx,
      offset,
      alpha * 0.92,
      layer === 0 ? 1.55 : 0.68,
    );
  }

  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(cx - 56, 322);
  ctx.bezierCurveTo(cx - 47, 352, cx - 32, 372, cx - 22, 402);
  ctx.moveTo(cx + 56, 322);
  ctx.bezierCurveTo(cx + 47, 352, cx + 32, 372, cx + 22, 402);
  ctx.strokeStyle = cyan(0.36 + power * 0.22);
  ctx.lineWidth = 1.05;
  ctx.stroke();

  drawParticles(ctx, particles, "body", t, power);
  drawNeuralCore(ctx, time, power, audioLevel);

  ctx.save();
  applyHeadPose(ctx, pose);

  for (let ring = 0; ring < 4; ring += 1) {
    const travel = ((t * (phase === "thinking" ? 26 : 13) + ring * 22) % 72) - 10;
    drawHeadContour(
      ctx,
      cx,
      207,
      101 + travel * 0.35,
      133 + travel * 0.48,
      0.05 + power * 0.038,
      0.68,
    );
  }

  ctx.shadowColor = "rgba(36, 225, 255, 0.72)";
  ctx.shadowBlur = 8 + power * 8;
  for (let layer = 0; layer < 9; layer += 1) {
    const offset = layer * 4.4;
    const alpha = Math.max(0.052, 0.34 - layer * 0.029) * (0.72 + power * 0.5);
    drawHeadContour(
      ctx,
      cx,
      207,
      87 + offset * 0.62,
      122 + offset * 0.78,
      alpha,
      layer === 0 ? 1.75 : 0.75,
    );
  }
  ctx.shadowBlur = 0;

  drawParticles(ctx, particles, "head", t, power);
  drawFaceCore(ctx, time, power, audioLevel, phase === "speaking");

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
      ctx.strokeStyle = cyan((1 - progress) * (0.055 + power * 0.085));
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }
  }

  ctx.restore();

  const scanSpeed = phase === "thinking" ? 0.21 : phase === "speaking" ? 0.16 : 0.105;
  const scanY = 88 + ((time * scanSpeed) % 385);
  const scanGradient = ctx.createLinearGradient(110, scanY, 450, scanY);
  scanGradient.addColorStop(0, "rgba(45, 227, 255, 0)");
  scanGradient.addColorStop(0.28, cyan(0.1 + power * 0.11));
  scanGradient.addColorStop(0.5, cyan(0.42 + power * 0.25));
  scanGradient.addColorStop(0.72, cyan(0.1 + power * 0.11));
  scanGradient.addColorStop(1, "rgba(45, 227, 255, 0)");
  ctx.strokeStyle = scanGradient;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(104, scanY);
  ctx.lineTo(456, scanY);
  ctx.stroke();

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
    let lastTranscript = "";
    let gesture: GestureState = {
      kind: "neutral",
      startedAt: 0,
      duration: 0,
    };

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

    const updateGestureFromTranscript = () => {
      const transcript = document.querySelector<HTMLElement>(".voice-transcript");
      const text = transcript?.textContent?.trim() ?? "";
      if (!text || text === lastTranscript) return;
      lastTranscript = text;

      const nextGesture = classifyGesture(text);
      if (nextGesture === "neutral") return;

      const now = performance.now();
      if (gesture.kind === nextGesture && now - gesture.startedAt < 850) return;

      gesture = {
        kind: nextGesture,
        startedAt: now,
        duration: gestureDuration(nextGesture),
      };
    };

    const transcriptObserver = new MutationObserver(updateGestureFromTranscript);
    transcriptObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    updateGestureFromTranscript();

    const draw = (time: number) => {
      animationFrame = 0;
      if (!visible) return;

      audioLevel += (targetAudioLevel - audioLevel) * 0.18;
      targetAudioLevel *= 0.94;

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
    document.addEventListener("visibilitychange", onVisibilityChange);
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      transcriptObserver.disconnect();
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
