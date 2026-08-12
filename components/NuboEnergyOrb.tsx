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
  flash: number;
  drift: number;
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
  return `rgba(39, 231, 245, ${clamp01(alpha)})`;
}

function cyanWhite(alpha: number) {
  return `rgba(190, 255, 255, ${clamp01(alpha)})`;
}

function gold(alpha: number) {
  return `rgba(255, 166, 36, ${clamp01(alpha)})`;
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

  if (reducedMotion) {
    return { particleCount: 1200, frameInterval: 1000 / 20, dpr: 1 };
  }

  if (cores <= 4) {
    return { particleCount: 3200, frameInterval: 1000 / 26, dpr: 1 };
  }

  if (mobile) {
    return {
      particleCount: 6200,
      frameInterval: 1000 / 30,
      dpr: Math.min(window.devicePixelRatio || 1, 1.12),
    };
  }

  return {
    particleCount: 12400,
    frameInterval: 1000 / 45,
    dpr: Math.min(window.devicePixelRatio || 1, 1.32),
  };
}

function seededRandom(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function particleVisual(r1: number, r2: number, r3: number) {
  if (r1 > 0.972) {
    return {
      size: 1.75 + r2 * 1.75,
      alpha: 0.54 + r3 * 0.38,
      flash: 1.15 + r2 * 0.55,
    };
  }

  if (r1 > 0.84) {
    return {
      size: 0.8 + r2 * 1.15,
      alpha: 0.25 + r3 * 0.42,
      flash: 0.72 + r2 * 0.5,
    };
  }

  return {
    size: 0.2 + r2 * 0.72,
    alpha: 0.045 + r3 * 0.28,
    flash: 0.34 + r2 * 0.45,
  };
}

function createParticles(count: number): HologramParticle[] {
  return Array.from({ length: count }, (_, index) => {
    const r1 = seededRandom(index + 1);
    const r2 = seededRandom(index + 31);
    const r3 = seededRandom(index + 67);
    const r4 = seededRandom(index + 109);
    const r5 = seededRandom(index + 151);
    const r6 = seededRandom(index + 197);
    const visual = particleVisual(r4, r5, r6);

    if (r1 < 0.29) {
      const angle = r2 * Math.PI * 2;
      const shell = 0.76 + Math.sqrt(r3) * 0.38;
      const scatter = r5 > 0.78 ? 1 + (r5 - 0.78) * 2.8 : 1;
      return {
        x:
          AVATAR_WIDTH / 2 +
          Math.cos(angle) * 92 * shell * scatter +
          (r6 - 0.5) * 16,
        y:
          205 +
          Math.sin(angle) * 127 * shell * scatter +
          (r4 - 0.5) * 13,
        size: visual.size,
        alpha: visual.alpha,
        speed: 0.22 + r2 * 1.16,
        phase: r4 * Math.PI * 2,
        depth: 0.38 + r5 * 0.62,
        flash: visual.flash,
        drift: 0.7 + r6 * 1.4,
        region: "head",
      };
    }

    if (r1 < 0.86) {
      const ySeed = seededRandom(index + 233);
      const y = 315 + ySeed * 280;
      const vertical = clamp01((y - 315) / 280);
      const side = r2 * 2 - 1;
      const shoulderWidth = 66 + Math.pow(vertical, 0.62) * 210;
      const shell = 0.74 + r3 * 0.45;
      const outerScatter = r5 > 0.8 ? (r5 - 0.8) * 120 : 0;

      return {
        x:
          AVATAR_WIDTH / 2 +
          side * shoulderWidth * shell +
          Math.sign(side || 1) * outerScatter +
          (r6 - 0.5) * 24,
        y: y + (r4 - 0.5) * (17 + vertical * 13),
        size: visual.size,
        alpha: visual.alpha * (0.82 + vertical * 0.2),
        speed: 0.18 + r1 * 1.02,
        phase: r2 * Math.PI * 2,
        depth: 0.34 + r5 * 0.66,
        flash: visual.flash,
        drift: 0.72 + r6 * 1.5,
        region: "body",
      };
    }

    const angle = r2 * Math.PI * 2;
    const radiusX = 145 + r3 * 185;
    const radiusY = 178 + r5 * 145;
    return {
      x: AVATAR_WIDTH / 2 + Math.cos(angle) * radiusX,
      y: 320 + Math.sin(angle) * radiusY,
      size: visual.size * 0.9,
      alpha: visual.alpha * 0.55,
      speed: 0.13 + r2 * 0.62,
      phase: r4 * Math.PI * 2,
      depth: 0.25 + r5 * 0.52,
      flash: visual.flash * 0.72,
      drift: 0.9 + r6 * 1.8,
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

function drawHeadWireframe(
  ctx: CanvasRenderingContext2D,
  time: number,
  power: number,
  speechLift: number,
) {
  const cx = AVATAR_WIDTH / 2;
  const cy = 205;

  ctx.save();
  ctx.shadowColor = "rgba(35, 230, 245, 0.72)";
  ctx.shadowBlur = 6 + power * 7 + speechLift * 4;

  for (let layer = 0; layer < 8; layer += 1) {
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      87 + layer * 4.4,
      119 + layer * 5.3,
      0,
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = cyan(
      Math.max(0.035, 0.27 - layer * 0.026) *
        (0.76 + power * 0.45 + speechLift * 0.18),
    );
    ctx.lineWidth = layer === 0 ? 1.35 : 0.55;
    ctx.stroke();
  }

  ctx.shadowBlur = 0;

  for (let band = 0; band < 39; band += 1) {
    const y = cy - 111 + band * 5.75;
    const ny = (y - cy) / 119;
    const half = Math.sqrt(Math.max(0, 1 - ny * ny)) * 86;
    const breathing = Math.sin(time * 0.0038 + band * 0.41) * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.quadraticCurveTo(cx + breathing, y + 1.4, cx + half, y);
    ctx.strokeStyle = cyan(0.08 + power * 0.09 + speechLift * 0.06);
    ctx.lineWidth = band % 6 === 0 ? 0.82 : 0.46;
    ctx.stroke();
  }
}

function drawTorsoWireframe(
  ctx: CanvasRenderingContext2D,
  time: number,
  power: number,
  speechLift: number,
) {
  const cx = AVATAR_WIDTH / 2;

  ctx.save();
  ctx.shadowColor = "rgba(35, 230, 245, 0.68)";
  ctx.shadowBlur = 7 + power * 7 + speechLift * 5;

  for (let layer = 0; layer < 10; layer += 1) {
    const d = layer * 5.2;
    ctx.beginPath();
    ctx.moveTo(cx - 53 - d * 0.2, 326 + d * 0.08);
    ctx.bezierCurveTo(
      cx - 80 - d * 0.2,
      359,
      cx - 143 - d * 0.65,
      382 + d * 0.16,
      cx - 192 - d * 0.88,
      421 + d * 0.22,
    );
    ctx.bezierCurveTo(
      cx - 230 - d,
      459 + d * 0.2,
      cx - 261 - d,
      520,
      cx - 275 - d * 0.72,
      590,
    );
    ctx.moveTo(cx + 53 + d * 0.2, 326 + d * 0.08);
    ctx.bezierCurveTo(
      cx + 80 + d * 0.2,
      359,
      cx + 143 + d * 0.65,
      382 + d * 0.16,
      cx + 192 + d * 0.88,
      421 + d * 0.22,
    );
    ctx.bezierCurveTo(
      cx + 230 + d,
      459 + d * 0.2,
      cx + 261 + d,
      520,
      cx + 275 + d * 0.72,
      590,
    );
    ctx.strokeStyle = cyan(
      Math.max(0.034, 0.24 - layer * 0.022) *
        (0.76 + power * 0.46 + speechLift * 0.18),
    );
    ctx.lineWidth = layer === 0 ? 1.28 : 0.52;
    ctx.stroke();
  }

  ctx.shadowBlur = 0;

  for (let band = 0; band < 13; band += 1) {
    const y = 383 + band * 16.3;
    const progress = band / 12;
    const half = 100 + Math.pow(progress, 0.68) * 175;
    const lift = Math.sin(time * 0.003 + band * 0.7) * 1.3;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.quadraticCurveTo(cx, y - 17 - progress * 7 + lift, cx + half, y);
    ctx.strokeStyle = cyan(0.055 + power * 0.055 + speechLift * 0.04);
    ctx.lineWidth = band % 3 === 0 ? 0.7 : 0.4;
    ctx.stroke();
  }
}

function drawFaceCore(
  ctx: CanvasRenderingContext2D,
  time: number,
  power: number,
  audioLevel: number,
  speaking: boolean,
) {
  const cx = AVATAR_WIDTH / 2;
  const cy = 220;
  const speechRhythm = speaking
    ? 0.5 +
      Math.sin(time * 0.017) * 0.19 +
      Math.sin(time * 0.031 + 1.1) * 0.12
    : 0;
  const drive = Math.max(0, Math.min(1.4, audioLevel * 2.6 + speechRhythm));
  const pulse = 1 + Math.sin(time * 0.0052) * 0.015 + drive * 0.028;
  const rx = 48 * pulse;
  const ry = 61 * pulse;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.shadowColor = `rgba(255, 145, 28, ${speaking ? 0.98 : 0.58})`;
  ctx.shadowBlur = speaking ? 24 + drive * 25 : 9 + power * 5;

  const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 66);
  glow.addColorStop(
    0,
    `rgba(255, 224, 118, ${Math.min(1, 0.42 + power * 0.16 + drive * 0.34)})`,
  );
  glow.addColorStop(
    0.48,
    `rgba(255, 143, 32, ${Math.min(0.94, 0.19 + power * 0.15 + drive * 0.34)})`,
  );
  glow.addColorStop(1, "rgba(255, 105, 15, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 70, cy - 76, 140, 152);

  for (let band = 0; band < 36; band += 1) {
    const y = cy - 54 + band * 3.1;
    const ny = (y - cy) / 56;
    const half = Math.sqrt(Math.max(0, 1 - ny * ny)) * 43;
    const wave = Math.sin(time * 0.006 + band * 0.47) * (0.8 + power * 1.6);
    const voice = Math.sin(time * 0.015 + band * 0.78) * drive * 5.2;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.quadraticCurveTo(cx + wave + voice, y + 1.4, cx + half, y);
    ctx.strokeStyle = gold(0.2 + power * 0.24 + drive * 0.3);
    ctx.lineWidth = band % 6 === 0 ? 1.05 : 0.58;
    ctx.stroke();
  }

  for (let i = 0; i < 74; i += 1) {
    const a = seededRandom(i + 701) * Math.PI * 2;
    const radial = Math.sqrt(seededRandom(i + 743));
    const sparkle =
      0.45 + 0.55 * Math.sin(time * 0.017 + i * 1.31 + seededRandom(i + 797));
    ctx.fillStyle = gold(
      (0.16 + seededRandom(i + 821) * 0.4) *
        (0.68 + sparkle * 0.48) *
        (speaking ? 1.25 + drive * 0.45 : 0.82),
    );
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(a) * 42 * radial,
      cy + Math.sin(a) * 54 * radial,
      0.35 + seededRandom(i + 853) * 0.95,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  ctx.restore();
}

function drawOrangeNeckEnergy(
  ctx: CanvasRenderingContext2D,
  time: number,
  power: number,
  audioLevel: number,
  speaking: boolean,
) {
  const cx = AVATAR_WIDTH / 2;
  const rhythm = speaking
    ? 0.42 + Math.sin(time * 0.013) * 0.16 + audioLevel * 0.8
    : 0.08 + Math.sin(time * 0.004) * 0.03;
  const drive = clamp01(rhythm);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(255, 145, 30, 0.88)";
  ctx.shadowBlur = 7 + power * 7 + drive * 14;

  for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
    const side = sideIndex === 0 ? -1 : 1;
    for (let branch = 0; branch < 6; branch += 1) {
      const spread = 8 + branch * 5.3;
      const jitter = Math.sin(time * 0.004 + branch * 1.2) * 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + side * (16 + branch * 2.1), 282 + branch * 1.4);
      ctx.bezierCurveTo(
        cx + side * (23 + spread * 0.72),
        312,
        cx + side * (18 + spread * 0.55 + jitter),
        339,
        cx + side * (16 + spread * 0.46),
        365,
      );
      ctx.bezierCurveTo(
        cx + side * (12 + spread * 0.3),
        394,
        cx + side * (8 + spread * 0.16),
        420,
        cx + side * (6 + branch * 1.3),
        449,
      );
      ctx.strokeStyle = gold(
        0.22 + power * 0.22 + drive * 0.32 - branch * 0.018,
      );
      ctx.lineWidth = branch === 0 ? 1.8 : 0.72 + (5 - branch) * 0.08;
      ctx.stroke();
    }
  }

  for (let stem = -2; stem <= 2; stem += 1) {
    ctx.beginPath();
    ctx.moveTo(cx + stem * 4.4, 331);
    ctx.bezierCurveTo(
      cx + stem * 3.5,
      365,
      cx + stem * 2.4,
      408,
      cx + stem * 1.8,
      461,
    );
    ctx.strokeStyle = gold(0.17 + power * 0.2 + drive * 0.28);
    ctx.lineWidth = stem === 0 ? 1.7 : 0.72;
    ctx.stroke();
  }

  for (let i = 0; i < 94; i += 1) {
    const p = seededRandom(i + 1103);
    const side = seededRandom(i + 1129) < 0.5 ? -1 : 1;
    const spread = (1 - p) * 27 + 5;
    const x = cx + side * spread * (0.35 + seededRandom(i + 1151) * 0.72);
    const y = 292 + p * 171 + (seededRandom(i + 1171) - 0.5) * 8;
    const shimmer = 0.5 + 0.5 * Math.sin(time * 0.014 + i * 0.81);
    ctx.fillStyle = gold(
      (0.13 + seededRandom(i + 1193) * 0.35) *
        (0.6 + shimmer * 0.55) *
        (1 + drive * 0.65),
    );
    ctx.beginPath();
    ctx.arc(x, y, 0.3 + seededRandom(i + 1217) * 0.82, 0, Math.PI * 2);
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

    const ambientBoost = region === "ambient" ? 1.7 : 1;
    const driftX =
      Math.sin(t * particle.speed + particle.phase) *
      (1.4 + power * 2.1) *
      particle.depth *
      particle.drift *
      ambientBoost;
    const driftY =
      Math.cos(t * particle.speed * 0.73 + particle.phase) *
      (1.15 + power * 1.8) *
      particle.depth *
      particle.drift *
      ambientBoost;
    const sparkle = 0.42 + 0.58 * Math.sin(t * 2.15 + particle.phase);
    const flash = Math.max(0, Math.sin(t * (3.1 + particle.flash) + particle.phase));
    const alpha =
      particle.alpha *
      (0.54 + sparkle * 0.58 + flash * particle.flash * 0.16) *
      (0.72 + power * 0.5) *
      (0.72 + particle.depth * 0.4) *
      (1 + speechLift * 0.64);

    const brightSpark = particle.size > 1.65 && flash > 0.55;
    if (brightSpark) {
      ctx.shadowColor = "rgba(190, 255, 255, 0.72)";
      ctx.shadowBlur = 5 + particle.size * 2.4;
      ctx.fillStyle = cyanWhite(alpha);
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = cyan(alpha);
    }

    ctx.beginPath();
    ctx.arc(
      particle.x + driftX,
      particle.y + driftY,
      particle.size * (0.72 + power * 0.18 + speechLift * 0.04),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawNLogo(
  ctx: CanvasRenderingContext2D,
  time: number,
  power: number,
  audioLevel: number,
  speaking: boolean,
) {
  const cx = AVATAR_WIDTH / 2;
  const cy = 475;
  const rhythm = speaking
    ? 0.56 +
      Math.sin(time * 0.014) * 0.18 +
      Math.sin(time * 0.026 + 0.8) * 0.12
    : 0.1 + Math.sin(time * 0.004) * 0.035;
  const drive = clamp01(rhythm + audioLevel * 1.45);

  const halo = ctx.createRadialGradient(cx, cy, 2, cx, cy, 46 + drive * 10);
  halo.addColorStop(
    0,
    `rgba(116, 248, 255, ${0.09 + power * 0.07 + drive * 0.22})`,
  );
  halo.addColorStop(
    0.52,
    `rgba(18, 184, 255, ${0.05 + power * 0.05 + drive * 0.12})`,
  );
  halo.addColorStop(1, "rgba(20, 170, 255, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, 46 + drive * 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.shadowColor = "rgba(54, 235, 255, 0.95)";
  ctx.shadowBlur = speaking ? 14 + drive * 16 : 7;

  const dotCount = 36;
  for (let stroke = 0; stroke < 3; stroke += 1) {
    for (let index = 0; index < dotCount; index += 1) {
      const p = index / (dotCount - 1);
      let x: number;
      let y: number;

      if (stroke === 0) {
        x = cx - 23;
        y = cy - 30 + p * 60;
      } else if (stroke === 1) {
        // Standard capital N: diagonal goes from top-left to bottom-right.
        x = cx - 23 + p * 46;
        y = cy - 30 + p * 60;
      } else {
        x = cx + 23;
        y = cy - 30 + p * 60;
      }

      const seed = stroke * 100 + index;
      const jitterX = (seededRandom(seed + 881) - 0.5) * 3;
      const jitterY = (seededRandom(seed + 937) - 0.5) * 3;
      const shimmer =
        0.55 + 0.45 * Math.sin(time * 0.015 + index * 0.66 + stroke);
      const alpha = 0.35 + power * 0.18 + drive * 0.36 + shimmer * 0.12;
      const size =
        0.58 + seededRandom(seed + 991) * 1.05 + (speaking ? drive * 0.18 : 0);

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
    ? 0.46 +
      Math.sin(time * 0.012) * 0.1 +
      Math.sin(time * 0.021 + 0.7) * 0.08 +
      audioLevel * 0.72
    : 0;
  const bodySway = Math.sin(t * 0.43) * (1.45 + power * 1.72);
  const breathe = Math.sin(t * 1.34) * (1.45 + power * 1.02);
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

  const aura = ctx.createRadialGradient(cx, 270, 40, cx, 310, 314);
  aura.addColorStop(
    0,
    `rgba(14, 163, 190, ${0.046 + power * 0.032 + speechLift * 0.052})`,
  );
  aura.addColorStop(
    0.58,
    `rgba(0, 88, 116, ${0.027 + power * 0.022 + speechLift * 0.025})`,
  );
  aura.addColorStop(1, "rgba(0, 35, 55, 0)");
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, AVATAR_WIDTH, AVATAR_HEIGHT);

  drawParticles(ctx, particles, "ambient", t, power, speechLift * 0.7);
  drawTorsoWireframe(ctx, time, power, speechLift);
  drawParticles(ctx, particles, "body", t, power, speechLift);
  drawOrangeNeckEnergy(ctx, time, power, audioLevel, speaking);
  drawNLogo(ctx, time, power, audioLevel, speaking);

  ctx.save();
  applyHeadPose(ctx, pose);
  drawHeadWireframe(ctx, time, power, speechLift);
  drawParticles(ctx, particles, "head", t, power, speechLift);
  drawFaceCore(ctx, time, power, audioLevel, speaking);
  ctx.restore();

  const scanSpeed = phase === "thinking" ? 0.2 : speaking ? 0.165 : 0.095;
  const scanY = 72 + ((time * scanSpeed) % 460);
  const scanGradient = ctx.createLinearGradient(75, scanY, 485, scanY);
  scanGradient.addColorStop(0, "rgba(45, 227, 255, 0)");
  scanGradient.addColorStop(
    0.5,
    cyan(0.22 + power * 0.18 + speechLift * 0.14),
  );
  scanGradient.addColorStop(1, "rgba(45, 227, 255, 0)");
  ctx.strokeStyle = scanGradient;
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(72, scanY);
  ctx.lineTo(488, scanY);
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
