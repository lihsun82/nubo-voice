"use client";

import { useEffect, useRef } from "react";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

const AVATAR_WIDTH = 560;
const AVATAR_HEIGHT = 620;
const ACTION_AMPLITUDE = 1.4;

type ParticleRegion = "head" | "body" | "ambient";
type AvatarGesture =
  | "neutral"
  | "nod"
  | "question"
  | "shake"
  | "think"
  | "shrug"
  | "emphasis";

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
  shoulderLift: number;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function cyan(alpha: number) {
  return `rgba(39, 231, 245, ${clamp01(alpha)})`;
}

function cyanWhite(alpha: number) {
  return `rgba(206, 255, 255, ${clamp01(alpha)})`;
}

function gold(alpha: number) {
  return `rgba(255, 166, 36, ${clamp01(alpha)})`;
}

function phasePower(phase: NuboVoicePhase) {
  switch (phase) {
    case "connecting":
      return 0.62;
    case "listening":
      return 0.8;
    case "thinking":
      return 0.92;
    case "speaking":
      return 1;
    case "error":
      return 0.38;
    default:
      return 0.5;
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
    return { particleCount: 3200, frameInterval: 1000 / 26, dpr: Math.min(window.devicePixelRatio || 1, 1.1) };
  }

  if (mobile) {
    return {
      particleCount: 6200,
      frameInterval: 1000 / 30,
      dpr: Math.min(window.devicePixelRatio || 1, 1.35),
    };
  }

  return {
    particleCount: 12400,
    frameInterval: 1000 / 45,
    dpr: Math.min(window.devicePixelRatio || 1, 1.7),
  };
}

function seededRandom(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function particleVisual(r1: number, r2: number, r3: number) {
  if (r1 > 0.972) {
    return {
      size: 1.8 + r2 * 1.85,
      alpha: 0.68 + r3 * 0.3,
      flash: 1.25 + r2 * 0.65,
    };
  }

  if (r1 > 0.84) {
    return {
      size: 0.82 + r2 * 1.18,
      alpha: 0.34 + r3 * 0.46,
      flash: 0.8 + r2 * 0.55,
    };
  }

  return {
    size: 0.2 + r2 * 0.74,
    alpha: 0.07 + r3 * 0.32,
    flash: 0.4 + r2 * 0.5,
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
        alpha: visual.alpha * (0.84 + vertical * 0.2),
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
      alpha: visual.alpha * 0.58,
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

  if (/(不知道|不確定|說不準|很難說|看情況)/.test(normalized)) {
    return "shrug";
  }

  if (/(讓我想|我想一下|思考|分析一下|我來想|先想想|考慮一下)/.test(normalized)) {
    return "think";
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
      return 1250;
    case "question":
      return 1500;
    case "shake":
      return 1350;
    case "think":
      return 1800;
    case "shrug":
      return 1350;
    case "emphasis":
      return 1050;
    default:
      return 0;
  }
}

function getGesturePose(
  gesture: GestureState,
  time: number,
): GesturePose {
  const elapsed = time - gesture.startedAt;
  const active =
    gesture.duration > 0 && elapsed >= 0 && elapsed < gesture.duration;
  const progress = active ? elapsed / gesture.duration : 1;
  const envelope = active ? Math.sin(clamp01(progress) * Math.PI) : 0;

  let headX = 0;
  let headY = 0;
  let headRoll = 0;
  let headScaleY = 1;
  let shoulderLift = 0;

  if (!active) {
    return { headX, headY, headRoll, headScaleY, shoulderLift };
  }

  if (gesture.kind === "nod") {
    const wave = Math.sin(progress * Math.PI * 3.8) * envelope;
    headY += wave * 6.3 * ACTION_AMPLITUDE;
    headScaleY -= Math.max(0, wave) * 0.014 * ACTION_AMPLITUDE;
  } else if (gesture.kind === "question") {
    headY -= envelope * 4.8 * ACTION_AMPLITUDE;
    headX += envelope * 2.1 * ACTION_AMPLITUDE;
    headRoll += envelope * 0.032 * ACTION_AMPLITUDE;
  } else if (gesture.kind === "shake") {
    const wave = Math.sin(progress * Math.PI * 4.8) * envelope;
    headX += wave * 6.4 * ACTION_AMPLITUDE;
    headRoll += wave * 0.014 * ACTION_AMPLITUDE;
  } else if (gesture.kind === "think") {
    headY -= envelope * 7.2 * ACTION_AMPLITUDE;
    headX += envelope * 1.5 * ACTION_AMPLITUDE;
    headRoll -= envelope * 0.018 * ACTION_AMPLITUDE;
    headScaleY += envelope * 0.012 * ACTION_AMPLITUDE;
  } else if (gesture.kind === "shrug") {
    shoulderLift = envelope * 4.6 * ACTION_AMPLITUDE;
    headY -= envelope * 1.4 * ACTION_AMPLITUDE;
    headRoll +=
      Math.sin(progress * Math.PI * 2) *
      envelope *
      0.012 *
      ACTION_AMPLITUDE;
  } else if (gesture.kind === "emphasis") {
    const wave = Math.sin(progress * Math.PI * 2.2) * envelope;
    headY += wave * 3.2 * ACTION_AMPLITUDE;
  }

  return { headX, headY, headRoll, headScaleY, shoulderLift };
}

function drawHeadWireframe(
  ctx: CanvasRenderingContext2D,
  power: number,
  speechLift: number,
) {
  const cx = AVATAR_WIDTH / 2;
  const cy = 205;

  ctx.save();
  ctx.shadowColor = "rgba(35, 235, 250, 0.9)";
  ctx.shadowBlur = 8 + power * 8 + speechLift * 7;

  for (let layer = 0; layer < 10; layer += 1) {
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
      Math.max(0.05, 0.32 - layer * 0.026) *
        (0.82 + power * 0.46 + speechLift * 0.24),
    );
    ctx.lineWidth = layer === 0 ? 1.45 : 0.58;
    ctx.stroke();
  }

  ctx.shadowBlur = 0;

  for (let band = 0; band < 54; band += 1) {
    const y = cy - 113 + band * 4.26;
    const ny = (y - cy) / 119;
    const half = Math.sqrt(Math.max(0, 1 - ny * ny)) * 86;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.quadraticCurveTo(cx, y + 1.2, cx + half, y);
    ctx.strokeStyle = cyan(0.1 + power * 0.1 + speechLift * 0.09);
    ctx.lineWidth = band % 6 === 0 ? 0.9 : 0.48;
    ctx.stroke();
  }

  ctx.restore();
}

function drawTorsoWireframe(
  ctx: CanvasRenderingContext2D,
  power: number,
  speechLift: number,
) {
  const cx = AVATAR_WIDTH / 2;

  ctx.save();
  ctx.shadowColor = "rgba(35, 235, 250, 0.86)";
  ctx.shadowBlur = 8 + power * 8 + speechLift * 7;

  for (let layer = 0; layer < 12; layer += 1) {
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
      Math.max(0.048, 0.29 - layer * 0.022) *
        (0.82 + power * 0.46 + speechLift * 0.24),
    );
    ctx.lineWidth = layer === 0 ? 1.35 : 0.55;
    ctx.stroke();
  }

  ctx.shadowBlur = 0;

  for (let band = 0; band < 20; band += 1) {
    const y = 379 + band * 10.35;
    const progress = band / 19;
    const half = 100 + Math.pow(progress, 0.68) * 175;
    ctx.beginPath();
    ctx.moveTo(cx - half, y);
    ctx.quadraticCurveTo(cx, y - 17 - progress * 7, cx + half, y);
    ctx.strokeStyle = cyan(0.07 + power * 0.065 + speechLift * 0.065);
    ctx.lineWidth = band % 3 === 0 ? 0.74 : 0.42;
    ctx.stroke();
  }

  ctx.restore();
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
    ? 0.58 +
      Math.sin(time * 0.017) * 0.18 +
      Math.sin(time * 0.031 + 1.1) * 0.12
    : 0.07 + Math.sin(time * 0.0045) * 0.025;
  const drive = Math.max(0, Math.min(1.45, audioLevel * 2.8 + speechRhythm));
  const breathe = 0.5 + 0.5 * Math.sin(time * 0.0048);
  const burst = speaking ? drive * (0.5 + 0.5 * Math.sin(time * 0.013)) : 0;

  ctx.save();

  // Hologram V3.7: diffuse orange molecular haze, never a filled orange sphere.
  const faceHaze = ctx.createRadialGradient(
    cx,
    cy + 2,
    2,
    cx,
    cy + 2,
    82 + drive * 5,
  );
  faceHaze.addColorStop(
    0,
    `rgba(255, 190, 66, ${0.11 + power * 0.045 + drive * 0.09})`,
  );
  faceHaze.addColorStop(
    0.36,
    `rgba(255, 143, 30, ${0.075 + drive * 0.07})`,
  );
  faceHaze.addColorStop(
    0.72,
    `rgba(255, 112, 19, ${0.028 + drive * 0.032})`,
  );
  faceHaze.addColorStop(1, "rgba(255, 98, 12, 0)");
  ctx.fillStyle = faceHaze;
  ctx.beginPath();
  ctx.arc(cx, cy + 2, 84 + drive * 5, 0, Math.PI * 2);
  ctx.fill();

  // Dense horizontal orange scan contours like the reference image.
  ctx.shadowColor = "rgba(255, 164, 39, 0.92)";
  ctx.shadowBlur = speaking ? 9 + drive * 14 : 4 + power * 5;
  for (let band = 0; band < 58; band += 1) {
    const y = cy - 58 + band * 2.03;
    const ny = (y - cy) / 59;
    const half = Math.sqrt(Math.max(0, 1 - ny * ny)) * 49;
    if (half < 1.6) continue;

    const edge = Math.max(0.12, 1 - Math.abs(ny));
    const wave = Math.sin(time * 0.0045 + band * 0.43) * (0.42 + drive * 0.85);
    const micro = Math.sin(time * 0.0105 + band * 0.79) * drive * 1.1;
    const alpha =
      (0.13 + power * 0.11 + drive * 0.16) * (0.42 + edge * 0.68);
    ctx.strokeStyle = gold(alpha);
    ctx.lineWidth = band % 8 === 0 ? 0.78 : 0.42;

    const gap = band % 5 === 0 ? 1.2 + seededRandom(band + 3101) * 2.6 : 0;
    if (gap > 0) {
      ctx.beginPath();
      ctx.moveTo(cx - half, y);
      ctx.quadraticCurveTo(cx - half * 0.38 + wave, y + micro, cx - gap, y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx + gap, y);
      ctx.quadraticCurveTo(cx + half * 0.38 - wave, y - micro, cx + half, y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - half, y);
      ctx.bezierCurveTo(
        cx - half * 0.38 + wave,
        y + micro,
        cx + half * 0.38 - wave,
        y - micro,
        cx + half,
        y,
      );
      ctx.stroke();
    }
  }

  ctx.shadowBlur = 0;

  // 366 orange particles: 70% small, 23% medium, 7% large.
  for (let i = 0; i < 366; i += 1) {
    const seed = i + 3901;
    const angle = seededRandom(seed) * Math.PI * 2;
    const radialSeed = seededRandom(seed + 43);
    const isHalo = radialSeed > 0.72;
    const radial = isHalo
      ? 0.78 + seededRandom(seed + 67) * 0.72
      : Math.pow(seededRandom(seed + 67), 0.7) * 0.94;
    const rx = isHalo ? 65 : 44;
    const ry = isHalo ? 82 : 58;
    const outward = speaking
      ? burst * (1.2 + seededRandom(seed + 89) * 5.8)
      : 0;
    const microDrift =
      Math.sin(
        time * (0.0015 + seededRandom(seed + 113) * 0.0018) + angle,
      ) * (isHalo ? 1.15 : 0.42);

    const x =
      cx +
      Math.cos(angle) * (rx * radial + outward) +
      microDrift * Math.cos(angle);
    const y =
      cy +
      Math.sin(angle) * (ry * radial + outward * 0.82) +
      microDrift * Math.sin(angle);

    const sizeClass = seededRandom(seed + 131);
    let size = 0;
    let baseAlpha = 0;
    let glow = 0;

    if (sizeClass < 0.7) {
      size = 0.24 + seededRandom(seed + 151) * 0.62;
      baseAlpha = 0.14 + seededRandom(seed + 173) * 0.34;
      glow = 0;
    } else if (sizeClass < 0.93) {
      size = 0.88 + seededRandom(seed + 151) * 0.72;
      baseAlpha = 0.24 + seededRandom(seed + 173) * 0.46;
      glow = 3.5;
    } else {
      size = 1.65 + seededRandom(seed + 151) * 1.15;
      baseAlpha = 0.46 + seededRandom(seed + 173) * 0.42;
      glow = 7.5;
    }

    const shimmer =
      0.42 +
      0.58 * Math.max(0, Math.sin(time * 0.015 + i * 0.91 + angle));
    const edge = Math.max(0.08, 1 - radial * 0.62);
    const alpha =
      baseAlpha *
      edge *
      (0.58 + shimmer * 0.7) *
      (speaking ? 1.12 + drive * 0.48 : 0.84 + breathe * 0.13);

    if (glow > 0) {
      ctx.shadowColor = "rgba(255, 191, 78, 0.98)";
      ctx.shadowBlur = glow + (speaking ? drive * 5 : 0);
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = gold(alpha);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Peripheral wisps keep the orange field molecular instead of spherical.
  for (let wisp = 0; wisp < 8; wisp += 1) {
    const a = seededRandom(wisp + 4401) * Math.PI * 2;
    const radius = 42 + seededRandom(wisp + 4437) * 39 + burst * 4;
    const wx = cx + Math.cos(a) * radius;
    const wy = cy + Math.sin(a) * radius * 1.2;
    const wr = 11 + seededRandom(wisp + 4473) * 17 + drive * 2;
    const haze = ctx.createRadialGradient(wx, wy, 0, wx, wy, wr);
    haze.addColorStop(
      0,
      `rgba(255, 155, 37, ${0.035 + drive * 0.052})`,
    );
    haze.addColorStop(1, "rgba(255, 126, 25, 0)");
    ctx.fillStyle = haze;
    ctx.beginPath();
    ctx.arc(wx, wy, wr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
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
    ? 0.74 +
      Math.sin(time * 0.015) * 0.15 +
      Math.sin(time * 0.027 + 0.9) * 0.1 +
      audioLevel * 0.95
    : 0.14 + Math.sin(time * 0.004) * 0.025;
  const drive = clamp01(rhythm);

  ctx.save();

  const neckGlow = ctx.createRadialGradient(cx, 365, 8, cx, 365, 138);
  neckGlow.addColorStop(
    0,
    `rgba(255, 174, 51, ${0.12 + power * 0.07 + drive * 0.3})`,
  );
  neckGlow.addColorStop(
    0.45,
    `rgba(255, 123, 24, ${0.065 + drive * 0.18})`,
  );
  neckGlow.addColorStop(1, "rgba(255, 106, 14, 0)");
  ctx.fillStyle = neckGlow;
  ctx.fillRect(cx - 155, 266, 310, 220);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(255, 157, 34, 0.98)";
  ctx.shadowBlur = speaking ? 16 + drive * 23 : 7 + power * 6;

  // Paired orange nerve bundles: flare below the jaw and converge down the neck.
  for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
    const side = sideIndex === 0 ? -1 : 1;

    for (let branch = 0; branch < 9; branch += 1) {
      const start = 13 + branch * 2.2;
      const flare = 30 + branch * 4.7;
      const mid = 25 + branch * 3.25;
      const lower = 8 + branch * 1.9;
      const pulse =
        Math.sin(time * 0.008 + branch * 0.72) * (0.7 + drive * 1.3);

      ctx.beginPath();
      ctx.moveTo(cx + side * start, 281 + branch * 1.2);
      ctx.bezierCurveTo(
        cx + side * (flare + pulse),
        310,
        cx + side * (flare + 8 + pulse * 0.7),
        326,
        cx + side * mid,
        349,
      );
      ctx.bezierCurveTo(
        cx + side * (mid - 5),
        376,
        cx + side * (lower + 7),
        414,
        cx + side * lower,
        458,
      );
      ctx.strokeStyle = gold(
        0.2 + power * 0.17 + drive * 0.4 - branch * 0.012,
      );
      ctx.lineWidth = branch === 0 ? 1.55 : 0.48 + (8 - branch) * 0.055;
      ctx.stroke();
    }

    // Fine outer filaments like the reference image.
    for (let twig = 0; twig < 5; twig += 1) {
      const offset = 38 + twig * 5.6;
      ctx.beginPath();
      ctx.moveTo(cx + side * (25 + twig * 2.2), 302 + twig * 6);
      ctx.quadraticCurveTo(
        cx + side * (offset + 10),
        338 + twig * 5,
        cx + side * (24 + twig * 2.1),
        389 + twig * 7,
      );
      ctx.strokeStyle = gold(0.11 + power * 0.09 + drive * 0.24);
      ctx.lineWidth = 0.42;
      ctx.stroke();
    }
  }

  // Fine central strands continue the orange energy into the chest.
  for (let stem = -3; stem <= 3; stem += 1) {
    ctx.beginPath();
    ctx.moveTo(cx + stem * 6.8, 331);
    ctx.bezierCurveTo(
      cx + stem * 6.0,
      365,
      cx + stem * 4.2,
      411,
      cx + stem * 3.0,
      466,
    );
    ctx.strokeStyle = gold(0.16 + power * 0.14 + drive * 0.36);
    ctx.lineWidth = stem === 0 ? 1.3 : 0.48;
    ctx.stroke();
  }

  // Broad molecular cloud around and between the orange nerve lines.
  for (let i = 0; i < 196; i += 1) {
    const p = seededRandom(i + 5103);
    const side = seededRandom(i + 5129) < 0.5 ? -1 : 1;
    const spread = (1 - p) * 60 + 9;
    const x =
      cx + side * spread * (0.34 + seededRandom(i + 5151) * 0.9);
    const y = 288 + p * 180 + (seededRandom(i + 5171) - 0.5) * 11;
    const sizeClass = seededRandom(i + 5181);
    const shimmer = 0.46 + 0.54 * Math.sin(time * 0.016 + i * 0.79);

    let size = 0.26 + seededRandom(i + 5217) * 0.64;
    let alpha = 0.16 + seededRandom(i + 5193) * 0.36;

    if (sizeClass > 0.91) {
      size = 1.15 + seededRandom(i + 5237) * 1.15;
      alpha += 0.2;
    } else if (sizeClass > 0.68) {
      size = 0.72 + seededRandom(i + 5237) * 0.72;
      alpha += 0.1;
    }

    ctx.fillStyle = gold(
      alpha * (0.64 + shimmer * 0.64) * (1 + drive * 0.88),
    );

    if (sizeClass > 0.91 && speaking) {
      ctx.shadowColor = "rgba(255, 183, 67, 0.96)";
      ctx.shadowBlur = 7 + drive * 8;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
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

    const motionScale =
      region === "ambient"
        ? 0.75
        : region === "head"
          ? 0.28
          : 0.24;
    const driftX =
      Math.sin(t * particle.speed + particle.phase) *
      motionScale *
      particle.depth *
      particle.drift;
    const driftY =
      Math.cos(t * particle.speed * 0.73 + particle.phase) *
      motionScale *
      0.8 *
      particle.depth *
      particle.drift;

    const sparkle = 0.46 + 0.54 * Math.sin(t * 2.35 + particle.phase);
    const flash = Math.max(
      0,
      Math.sin(t * (3.3 + particle.flash) + particle.phase),
    );
    const alpha =
      particle.alpha *
      (0.64 + sparkle * 0.62 + flash * particle.flash * 0.22) *
      (0.78 + power * 0.5) *
      (0.75 + particle.depth * 0.38) *
      (1 + speechLift * 0.82);

    const brightSpark = particle.size > 1.55 && flash > 0.42;
    if (brightSpark) {
      ctx.shadowColor = "rgba(206, 255, 255, 0.9)";
      ctx.shadowBlur = 7 + particle.size * 2.8;
      ctx.fillStyle = cyanWhite(alpha);
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = cyan(alpha);
    }

    ctx.beginPath();
    ctx.arc(
      particle.x + driftX,
      particle.y + driftY,
      particle.size * (0.76 + power * 0.19 + speechLift * 0.06),
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
    ? 0.58 +
      Math.sin(time * 0.014) * 0.18 +
      Math.sin(time * 0.026 + 0.8) * 0.12
    : 0.12 + Math.sin(time * 0.004) * 0.035;
  const drive = clamp01(rhythm + audioLevel * 1.45);

  const halo = ctx.createRadialGradient(cx, cy, 2, cx, cy, 46 + drive * 10);
  halo.addColorStop(
    0,
    `rgba(116, 248, 255, ${0.11 + power * 0.08 + drive * 0.24})`,
  );
  halo.addColorStop(
    0.52,
    `rgba(18, 184, 255, ${0.06 + power * 0.05 + drive * 0.14})`,
  );
  halo.addColorStop(1, "rgba(20, 170, 255, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, 46 + drive * 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.shadowColor = "rgba(54, 235, 255, 0.98)";
  ctx.shadowBlur = speaking ? 15 + drive * 17 : 8;

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
      const alpha = 0.4 + power * 0.18 + drive * 0.38 + shimmer * 0.14;
      const size =
        0.62 +
        seededRandom(seed + 991) * 1.08 +
        (speaking ? drive * 0.2 : 0);

      ctx.fillStyle = cyan(alpha);
      ctx.beginPath();
      ctx.arc(x + jitterX, y + jitterY, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
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
  const speaking = phase === "speaking";
  const speechLift = speaking
    ? 0.62 +
      Math.sin(time * 0.014) * 0.08 +
      Math.sin(time * 0.024 + 0.7) * 0.06 +
      audioLevel * 0.75
    : 0;
  const pose = getGesturePose(gesture, time);

  ctx.clearRect(0, 0, AVATAR_WIDTH, AVATAR_HEIGHT);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const aura = ctx.createRadialGradient(cx, 270, 40, cx, 310, 314);
  aura.addColorStop(
    0,
    `rgba(14, 163, 190, ${0.052 + power * 0.035 + speechLift * 0.06})`,
  );
  aura.addColorStop(
    0.58,
    `rgba(0, 88, 116, ${0.03 + power * 0.024 + speechLift * 0.03})`,
  );
  aura.addColorStop(1, "rgba(0, 35, 55, 0)");
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, AVATAR_WIDTH, AVATAR_HEIGHT);

  drawParticles(ctx, particles, "ambient", t, power, speechLift * 0.75);

  ctx.save();
  if (pose.shoulderLift > 0) {
    ctx.translate(0, -pose.shoulderLift);
  }
  drawTorsoWireframe(ctx, power, speechLift);
  drawParticles(ctx, particles, "body", t, power, speechLift);
  drawOrangeNeckEnergy(ctx, time, power, audioLevel, speaking);
  drawNLogo(ctx, time, power, audioLevel, speaking);
  ctx.restore();

  ctx.save();
  applyHeadPose(ctx, pose);
  drawHeadWireframe(ctx, power, speechLift);
  drawParticles(ctx, particles, "head", t, power, speechLift);
  drawFaceCore(ctx, time, power, audioLevel, speaking);
  ctx.restore();

  const scanSpeed = phase === "thinking" ? 0.2 : speaking ? 0.165 : 0.095;
  const scanY = 72 + ((time * scanSpeed) % 460);
  const scanGradient = ctx.createLinearGradient(75, scanY, 485, scanY);
  scanGradient.addColorStop(0, "rgba(45, 227, 255, 0)");
  scanGradient.addColorStop(
    0.5,
    cyan(0.26 + power * 0.2 + speechLift * 0.17),
  );
  scanGradient.addColorStop(1, "rgba(45, 227, 255, 0)");
  ctx.strokeStyle = scanGradient;
  ctx.lineWidth = 0.82;
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

    const startGesture = (kind: AvatarGesture) => {
      gesture = {
        kind,
        startedAt: performance.now(),
        duration: gestureDuration(kind),
      };
    };

    const setGestureFromText = (text: string) => {
      const normalized = text.trim();
      if (!normalized || normalized === lastTranscript) return;
      lastTranscript = normalized;
      startGesture(classifyGesture(normalized));
    };

    const onPhase = (event: Event) => {
      const next = (event as CustomEvent<{ phase?: NuboVoicePhase }>).detail
        ?.phase;
      if (!next) return;

      phase = next;

      if (next === "thinking") {
        const now = performance.now();
        const active =
          gesture.duration > 0 &&
          now - gesture.startedAt >= 0 &&
          now - gesture.startedAt < gesture.duration;
        if (!active) startGesture("think");
      }
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

      audioLevel += (targetAudioLevel - audioLevel) * 0.22;
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