"use client";

import { useEffect, useRef } from "react";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

const SIZE = 220;
const SPHERE_RADIUS = 0.72;
const TAU = 2 * Math.PI;
const FRAME_INTERVAL = 1000 / 30;

const RIM_COLORS = Array.from({ length: 36 }, (_, index) => `rgb(20, ${220 + index}, 255)`);

type Position = { x: number; y: number; z: number };

function randomPosition(radius: number): Position {
  const theta = Math.random() * TAU;
  const cosPhi = 2 * Math.random() - 1;
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);
  return {
    x: radius * sinPhi * Math.sin(theta),
    y: radius * cosPhi,
    z: radius * sinPhi * Math.cos(theta),
  };
}

// The ai.html sphere mesh, amber core, and outer dust, sampled for the kiosk canvas.
function createParticles() {
  const rows = 56;
  const columns = 76;
  const shell = [];

  for (let row = 0; row < rows; row++) {
    const phi = (0.025 + row / (rows - 1) * 0.95) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const rowColumns = Math.max(12, Math.round(columns * Math.pow(sinPhi, 0.72)));

    for (let column = 0; column < rowColumns; column++) {
      const theta = column / rowColumns * TAU;
      const waveA = Math.sin(theta * 3 + Math.sin(phi * 4) * 1.45);
      const waveB = Math.cos(phi * 5 - Math.sin(theta * 2) * 1.2);
      const vein = Math.abs(waveA * 0.65 + waveB * 0.35);
      const veinIntensity = vein < 0.14 && sinPhi > 0.22 ? (1 - vein / 0.14) * sinPhi : 0;
      shell.push({
        x: SPHERE_RADIUS * sinPhi * Math.sin(theta) + (Math.random() - 0.5) * 0.005,
        y: -SPHERE_RADIUS * cosPhi + (Math.random() - 0.5) * 0.005,
        z: SPHERE_RADIUS * sinPhi * Math.cos(theta) + (Math.random() - 0.5) * 0.005,
        phi,
        theta,
        veinIntensity,
        phase: Math.random() * TAU,
      });
    }
  }

  const core = Array.from({ length: 950 }, () => {
    const radiusRatio = Math.pow(Math.random(), 0.55);
    const intensity = 1 - radiusRatio;
    return {
      ...randomPosition(SPHERE_RADIUS * (0.06 + radiusRatio * 0.42)),
      intensity,
      phase: Math.random() * TAU,
      color: `rgb(255, ${Math.round(165 + intensity * 65)}, ${Math.round(25 + intensity * 55)})`,
    };
  });
  const dust = Array.from({ length: 250 }, () => ({
    ...randomPosition(SPHERE_RADIUS * (1.04 + Math.random() * 0.30)),
    phase: Math.random() * TAU,
    size: 0.4 + Math.random() * 0.65,
    alpha: 0.25 + Math.random() * 0.55,
  }));

  return { shell, core, dust };
}

function drawSphere(
  ctx: CanvasRenderingContext2D,
  { shell, core, dust }: ReturnType<typeof createParticles>,
  time: number,
  intensity: number,
  speaking: boolean,
) {
  const center = SIZE / 2;
  const scale = SIZE * 0.44;
  ctx.clearRect(0, 0, SIZE, SIZE);

  const glowRadius = scale * (0.36 + intensity * 0.14);
  const glow = ctx.createRadialGradient(center, center, 0, center, center, glowRadius);
  glow.addColorStop(0, `rgba(255, 200, 55, ${0.58 + intensity * 0.32})`);
  glow.addColorStop(0.4, `rgba(255, 145, 15, ${0.28 + intensity * 0.16})`);
  glow.addColorStop(0.75, "rgba(255, 110, 0, 0.06)");
  glow.addColorStop(1, "rgba(255, 110, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(center - glowRadius, center - glowRadius, glowRadius * 2, glowRadius * 2);

  const yaw = time * 0.18;
  const pitch = Math.sin(time * 0.45) * 0.08;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosX = Math.cos(pitch);
  const sinX = Math.sin(pitch);
  let rotatedX = 0;
  let rotatedY = 0;
  let depth = 0;
  let perspective = 1;

  function project(x: number, y: number, z: number) {
    const turnedZ = x * sinY + z * cosY;
    rotatedX = x * cosY - z * sinY;
    rotatedY = y * cosX - turnedZ * sinX;
    depth = y * sinX + turnedZ * cosX;
    perspective = 2.8 / (2.8 - depth);
  }

  function dot(radius: number, alpha: number) {
    const projectedScale = scale * perspective;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(center + rotatedX * projectedScale, center + rotatedY * projectedScale, radius * perspective, 0, TAU);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = "#23ebff";
  for (const particle of dust) {
    const drift = 1 + Math.sin(time * 1.3 + particle.phase) * 0.03 + intensity * 0.06;
    project(
      particle.x * drift,
      particle.y * drift + Math.sin(time * 1.1 + particle.phase) * 0.025,
      particle.z * drift,
    );
    const twinkle = 0.55 + 0.45 * Math.sin(time * 2.8 + particle.phase);
    dot(particle.size, particle.alpha * twinkle * 0.65);
  }

  const coreScale = 1 + intensity * 0.24 + Math.sin(time * 3.2) * 0.025;
  const coreCos = Math.cos(-time * 0.35);
  const coreSin = Math.sin(-time * 0.35);
  for (const particle of core) {
    project(
      (particle.x * coreCos - particle.z * coreSin) * coreScale,
      particle.y * coreScale,
      (particle.x * coreSin + particle.z * coreCos) * coreScale,
    );
    const pulse = 0.82 + Math.sin(time * 7.5 + particle.phase) * 0.18;
    ctx.fillStyle = particle.color;
    dot(0.62 + particle.intensity * 0.45 + intensity * 0.25, Math.min(0.96, (0.35 + particle.intensity * 0.65) * pulse));
  }

  const centerGlowRadius = 0.26 + intensity * 0.08;
  const centerGlowRadiusSquared = centerGlowRadius * centerGlowRadius;
  const waveTime = time * (speaking ? 9.5 : 2.6);
  const breathing = Math.sin(time * 1.8) * 0.012;
  for (const particle of shell) {
    const wave = Math.sin(particle.phi * 16 - waveTime + particle.theta * 2) * (0.008 + intensity * 0.032);
    const radialScale = 1 + wave + breathing;
    project(particle.x * radialScale, particle.y * radialScale, particle.z * radialScale);

    const normalZ = Math.max(-1, Math.min(1, depth / SPHERE_RADIUS));
    const rim = 1 - Math.abs(normalZ);
    const depthFade = normalZ < -0.1 ? 0.2 : 0.72 + rim * 0.35;
    const distanceSquared = rotatedX * rotatedX + rotatedY * rotatedY;
    if (particle.veinIntensity > 0.12) {
      const flow = 0.68 + 0.32 * Math.sin(particle.phi * 18 - time * 4.5);
      const alpha = Math.min(0.95, (0.42 + particle.veinIntensity * 0.55) * flow * depthFade);
      ctx.fillStyle = "#ffb423";
      dot(0.65 + particle.veinIntensity * 0.35 + intensity * 0.2, alpha);
    } else if (normalZ > 0.45 && distanceSquared < centerGlowRadiusSquared) {
      const blend = 1 - Math.sqrt(distanceSquared) / centerGlowRadius;
      const pulse = 0.84 + Math.sin(time * 7.5 + particle.phase) * 0.16;
      ctx.fillStyle = `rgb(${Math.round(20 + 235 * blend)}, ${Math.round(220 - 25 * blend)}, ${Math.round(255 - 200 * blend)})`;
      dot(0.6 + blend * 0.35 + intensity * 0.22, Math.min(0.95, (0.38 + blend * 0.55) * pulse));
    } else {
      const scan = 0.88 + 0.12 * Math.sin(particle.phi * 34 - time * 2.8);
      ctx.fillStyle = RIM_COLORS[Math.round(rim * 35)];
      dot(0.52 + rim * 0.38, Math.min(0.95, (0.24 + Math.pow(rim, 1.35) * 0.76) * depthFade * scan));
    }
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

export function NuboKioskOrb({ phase }: { phase: NuboVoicePhase }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const requestPaintRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
    requestPaintRef.current?.();
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const particles = createParticles();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const levels = {
      input: { value: 0, at: -Infinity },
      output: { value: 0, at: -Infinity },
    };
    let onscreen = true;
    let needsResize = true;
    let frame: number | null = null;
    let lastPaint = -Infinity;
    let previousPhase = phaseRef.current;
    let time = 0;
    let intensity = 0;

    const schedule = () => {
      if (frame === null && onscreen && !document.hidden) {
        frame = window.requestAnimationFrame(paint);
      }
    };

    function paint(timestamp: number) {
      frame = null;
      if (!onscreen || document.hidden || !ctx) return;
      const current = phaseRef.current;
      const elapsed = timestamp - lastPaint;
      if (needsResize || elapsed >= FRAME_INTERVAL - 0.5 || motion.matches || current !== previousPhase) {
        if (needsResize) {
          const { canvas } = ctx;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const pixels = Math.round((canvas.getBoundingClientRect().width || SIZE) * dpr);
          if (canvas.width !== pixels || canvas.height !== pixels) {
            canvas.width = pixels;
            canvas.height = pixels;
          }
          ctx.setTransform(pixels / SIZE, 0, 0, pixels / SIZE, 0, 0);
          needsResize = false;
        }
        const delta = Number.isFinite(elapsed) ? Math.min(elapsed / 1000, 0.05) : 0;
        lastPaint = timestamp;
        previousPhase = current;
        const speaking = current === "speaking";
        const listening = current === "listening";
        if (motion.matches) {
          drawSphere(ctx, particles, 0, speaking ? 0.52 : listening ? 0.24 : 0.04, speaking);
        } else {
          time += delta;
          const sample = levels[speaking ? "output" : "input"];
          const measured = timestamp - sample.at < 220 ? sample.value : 0;
          const pulse = speaking
            ? 0.42 + Math.sin(time * 10.5) * 0.22 + Math.sin(time * 21) * 0.16 + Math.cos(time * 6.5) * 0.10
            : listening
              ? 0.24 + Math.sin(time * 4.5) * 0.1
              : 0.04 + Math.sin(time * 1.8) * 0.025;
          const target = speaking || listening ? Math.max(measured, pulse) : pulse;
          const smoothing = speaking ? 0.18 : listening ? 0.14 : 0.08;
          intensity += (target - intensity) * (1 - Math.pow(1 - smoothing, delta * 60));
          drawSphere(ctx, particles, time, intensity, speaking);
        }
      }
      if (!motion.matches) schedule();
    }

    const onVoiceLevel = (event: Event) => {
      const detail = (event as CustomEvent<{ level?: number; source?: "input" | "output" }>).detail;
      if (typeof detail?.level !== "number" || !Number.isFinite(detail.level)) return;
      const sample = levels[detail.source === "input" ? "input" : "output"];
      sample.value = Math.max(0, Math.min(1, detail.level));
      sample.at = performance.now();
    };

    const observer = new IntersectionObserver(([entry]) => {
      onscreen = entry.isIntersecting;
      if (onscreen) schedule();
    });
    observer.observe(canvas);
    const resizeObserver = new ResizeObserver(() => {
      needsResize = true;
      schedule();
    });
    resizeObserver.observe(canvas);
    window.addEventListener("nubo:voice-level", onVoiceLevel);
    document.addEventListener("visibilitychange", schedule);
    motion.addEventListener("change", schedule);
    requestPaintRef.current = schedule;
    schedule();

    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("nubo:voice-level", onVoiceLevel);
      document.removeEventListener("visibilitychange", schedule);
      motion.removeEventListener("change", schedule);
      requestPaintRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} className="nubo-kiosk-orb" width={SIZE} height={SIZE} aria-hidden="true" />;
}
