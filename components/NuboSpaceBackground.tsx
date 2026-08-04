"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  radius: number;
  depth: number;
  speed: number;
  phase: number;
};

function isReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function NuboSpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", {
      alpha: true,
      desynchronized: true,
    });
    if (!canvas || !context) return;

    let frame = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let stars: Star[] = [];
    let visible = document.visibilityState === "visible";
    const reducedMotion = isReducedMotion();

    const createStars = () => {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const count = reducedMotion ? 35 : coarse ? 80 : 150;
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.35 + Math.random() * 1.45,
        depth: 0.25 + Math.random() * 0.75,
        speed: 0.018 + Math.random() * 0.055,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      createStars();
    };

    const drawNebula = (time: number) => {
      const drift = reducedMotion ? 0 : Math.sin(time * 0.00008) * width * 0.035;
      const nebula = context.createRadialGradient(
        width * 0.68 + drift,
        height * 0.22,
        0,
        width * 0.68 + drift,
        height * 0.22,
        Math.max(width, height) * 0.62,
      );
      nebula.addColorStop(0, "rgba(54, 211, 255, 0.14)");
      nebula.addColorStop(0.32, "rgba(71, 89, 255, 0.11)");
      nebula.addColorStop(0.62, "rgba(166, 55, 255, 0.08)");
      nebula.addColorStop(1, "rgba(2, 5, 18, 0)");
      context.fillStyle = nebula;
      context.fillRect(0, 0, width, height);

      const lower = context.createRadialGradient(
        width * 0.16 - drift * 0.5,
        height * 0.82,
        0,
        width * 0.16 - drift * 0.5,
        height * 0.82,
        Math.max(width, height) * 0.48,
      );
      lower.addColorStop(0, "rgba(174, 46, 255, 0.1)");
      lower.addColorStop(0.45, "rgba(45, 103, 255, 0.07)");
      lower.addColorStop(1, "rgba(2, 5, 18, 0)");
      context.fillStyle = lower;
      context.fillRect(0, 0, width, height);
    };

    const draw = (time: number) => {
      frame = 0;
      if (!visible) return;

      context.clearRect(0, 0, width, height);
      drawNebula(time);

      for (const star of stars) {
        if (!reducedMotion) {
          star.y += star.speed * star.depth;
          star.x += Math.sin(time * 0.0001 + star.phase) * 0.012 * star.depth;
          if (star.y > height + 4) {
            star.y = -4;
            star.x = Math.random() * width;
          }
        }

        const twinkle = reducedMotion
          ? 0.62
          : 0.45 + Math.sin(time * 0.0012 + star.phase) * 0.28;
        context.beginPath();
        context.arc(star.x, star.y, star.radius * star.depth, 0, Math.PI * 2);
        context.fillStyle = `rgba(211, 242, 255, ${Math.max(0.12, twinkle)})`;
        context.fill();

        if (star.depth > 0.78 && !reducedMotion) {
          context.beginPath();
          context.moveTo(star.x, star.y - star.radius * 5);
          context.lineTo(star.x, star.y + star.radius * 5);
          context.strokeStyle = `rgba(119, 224, 255, ${twinkle * 0.2})`;
          context.lineWidth = 0.45;
          context.stroke();
        }
      }

      frame = window.requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      if (visible && !frame) frame = window.requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    frame = window.requestAnimationFrame(draw);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="nubo-space-background" aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="nubo-space-grid" />
      <div className="nubo-space-horizon" />
    </div>
  );
}
