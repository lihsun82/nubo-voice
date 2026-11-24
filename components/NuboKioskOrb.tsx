"use client";

import { useEffect, useRef } from "react";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

export function NuboKioskOrb({ phase }: { phase: NuboVoicePhase }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ctx = context;
    const size = 220;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * scale;
    canvas.height = size * scale;
    ctx.scale(scale, scale);

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const particles = Array.from({ length: 45 }, () => ({
      x: (Math.random() - 0.5) * 160,
      y: (Math.random() - 0.5) * 160,
      z: (Math.random() - 0.5) * 160,
      radius: Math.random() * 2 + 0.8,
      color: Math.random() > 0.4 ? "#d4af37" : "#00f0ff",
    }));
    let angle = 0;
    let frame = 0;
    let lastPaint = -Infinity;
    let previousPhase = phaseRef.current;

    function paint(timestamp: number) {
      frame = 0;
      if (document.hidden) return;
      frame = window.requestAnimationFrame(paint);
      const current = phaseRef.current;
      if (timestamp - lastPaint < 1000 / 30 ||
          (motion.matches && lastPaint !== -Infinity && current === previousPhase)) return;
      lastPaint = timestamp;
      previousPhase = current;

      const cyan = current === "listening";
      const speaking = current === "speaking";
      const time = motion.matches ? 0 : timestamp * 0.002;
      const speed = motion.matches ? 0 : speaking ? 0.065 : cyan ? 0.042 : 0.014;
      const coreScale = speaking ? 1.08 + Math.sin(time * 10) * 0.08
        : cyan ? 0.88 + Math.sin(time * 8) * 0.05
        : 1 + Math.sin(time * 2) * 0.04;
      const wave = Math.sin(time * (cyan ? 12 : 5)) * (cyan || speaking ? 4 : 1);
      angle += speed;

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.beginPath();
      ctx.arc(0, 0, 82 + wave, 0, Math.PI * 2);
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = cyan ? "rgba(0,240,255,.4)" : "rgba(212,175,55,.25)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);

      const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, 65 * coreScale);
      glow.addColorStop(0, cyan ? "#00f0ff" : "#fff5c0");
      glow.addColorStop(0.5, cyan ? "rgba(10,132,255,.60)" : "rgba(212,175,55,.48)");
      if (speaking) glow.addColorStop(0.82, "rgba(0,240,255,.22)");
      glow.addColorStop(1, "rgba(7,9,14,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 68 * coreScale, 0, Math.PI * 2);
      ctx.fill();

      for (let orbit = 0; orbit < 3; orbit += 1) {
        ctx.save();
        ctx.rotate(orbit * Math.PI / 3 + angle);
        ctx.scale(1, 0.35 + Math.sin(time + orbit) * 0.1);
        ctx.beginPath();
        ctx.arc(0, 0, 75 + orbit * 4, 0, Math.PI * 2);
        ctx.strokeStyle = orbit % 2 ? "rgba(0,240,255,.48)" : "rgba(212,175,55,.42)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }
      const sinX = Math.sin(speed);
      const cosX = Math.cos(speed);
      const sinY = Math.sin(speed * 0.8);
      const cosY = Math.cos(speed * 0.8);
      for (const particle of particles) {
        const y = particle.y * cosX - particle.z * sinX;
        const z = particle.z * cosX + particle.y * sinX;
        const x = particle.x * cosY + z * sinY;
        particle.z = z * cosY - particle.x * sinY;
        particle.x = x;
        particle.y = y;
        const perspective = 200 / (200 + particle.z);

        ctx.beginPath();
        ctx.arc(x * perspective, y * perspective, Math.max(0.5, particle.radius * perspective), 0, Math.PI * 2);
        ctx.fillStyle = particle.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = particle.color;
        ctx.fill();
      }
      ctx.restore();
    }

    function resume() {
      if (!document.hidden && !frame) frame = window.requestAnimationFrame(paint);
    }

    resume();
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  return (
    <div className="nubo-kiosk-orbits" aria-hidden="true">
      <canvas ref={canvasRef} width={220} height={220} />
    </div>
  );
}
