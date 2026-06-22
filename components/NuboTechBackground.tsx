"use client";

import { useEffect, useRef } from "react";
import type { NuboVoicePhase } from "@/lib/browser-action-bridge";

type Particle = {
  theta: number;
  phi: number;
  speed: number;
  offset: number;
  size: number;
};

export function NuboTechBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrame = 0;
    let phase: NuboVoicePhase = "idle";
    let width = 0;
    let height = 0;
    let dpr = 1;

    const particles: Particle[] = Array.from({ length: 720 }, (_, index) => ({
      theta: Math.random() * Math.PI * 2,
      phi: Math.acos(2 * Math.random() - 1),
      speed: 0.0005 + Math.random() * 0.0012,
      offset: index * 0.017 + Math.random() * 4,
      size: 0.55 + Math.random() * 1.8,
    }));

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onPhase = (event: Event) => {
      const next = (event as CustomEvent<{ phase?: NuboVoicePhase }>).detail?.phase;
      if (next) phase = next;
    };

    const intensityForPhase = () => {
      if (phase === "listening") return 1.28;
      if (phase === "thinking") return 1.55;
      if (phase === "speaking") return 1.8;
      if (phase === "connecting") return 1.18;
      if (phase === "error") return 0.78;
      return 1;
    };

    const draw = (time: number) => {
      const intensity = intensityForPhase();
      const centerX = width * 0.5;
      const centerY = height * 0.42;
      const radius = Math.min(width, height) * (0.18 + intensity * 0.018);
      const pulse = 1 + Math.sin(time * 0.0024) * 0.025 * intensity;
      const rotation = time * 0.00012 * intensity;

      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        Math.max(width, height) * 0.7,
      );
      bg.addColorStop(0, `rgba(37, 26, 92, ${0.2 * intensity})`);
      bg.addColorStop(0.35, "rgba(11, 13, 28, 0.42)");
      bg.addColorStop(1, "rgba(2, 4, 10, 0.98)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      for (const particle of particles) {
        const drift = Math.sin(time * particle.speed + particle.offset) * 0.22;
        const theta = particle.theta + rotation + drift * 0.12;
        const phi = particle.phi + Math.sin(time * 0.00045 + particle.offset) * 0.08;

        const x3 = Math.sin(phi) * Math.cos(theta);
        const y3 = Math.cos(phi);
        const z3 = Math.sin(phi) * Math.sin(theta);
        const depth = (z3 + 1) * 0.5;
        const perspective = 0.72 + depth * 0.4;
        const x = centerX + x3 * radius * pulse * perspective;
        const y = centerY + y3 * radius * pulse * perspective;
        const alpha = (0.18 + depth * 0.72) * intensity;
        const magenta = 120 + Math.floor(110 * depth);
        const blue = 220 + Math.floor(35 * (1 - depth));

        ctx.beginPath();
        ctx.arc(x, y, particle.size * (0.6 + depth), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${magenta}, 80, ${blue}, ${Math.min(alpha, 0.95)})`;
        ctx.fill();

        if (depth > 0.42) {
          const trail = 7 + depth * 16 * intensity;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(
            x - Math.sin(theta) * trail,
            y + Math.cos(theta) * trail * 0.35,
          );
          ctx.strokeStyle = `rgba(76, 174, 255, ${0.05 + depth * 0.18})`;
          ctx.lineWidth = 0.6 + depth * 0.9;
          ctx.stroke();
        }
      }

      const ring = ctx.createRadialGradient(
        centerX,
        centerY,
        radius * 0.55,
        centerX,
        centerY,
        radius * 1.22,
      );
      ring.addColorStop(0, "rgba(0,0,0,0)");
      ring.addColorStop(0.72, `rgba(54, 120, 255, ${0.035 * intensity})`);
      ring.addColorStop(0.9, `rgba(219, 68, 255, ${0.18 * intensity})`);
      ring.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 1.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      const scanY = (time * 0.035) % (height + 200) - 100;
      const scan = ctx.createLinearGradient(0, scanY - 90, 0, scanY + 90);
      scan.addColorStop(0, "rgba(65, 127, 255, 0)");
      scan.addColorStop(0.5, `rgba(115, 95, 255, ${0.035 * intensity})`);
      scan.addColorStop(1, "rgba(65, 127, 255, 0)");
      ctx.fillStyle = scan;
      ctx.fillRect(0, scanY - 90, width, 180);

      animationFrame = window.requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("nubo-voice-phase", onPhase);
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("nubo-voice-phase", onPhase);
    };
  }, []);

  return <canvas ref={canvasRef} className="nubo-tech-background" aria-hidden="true" />;
}
