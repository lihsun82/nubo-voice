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
      const count = reducedMotion ? 48 : coarse ? 130 : 240;
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.45 + Math.random() * 1.7,
        depth: 0.25 + Math.random() * 0.75,
        speed: 0.012 + Math.random() * 0.045,
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
      const upper = context.createRadialGradient(
        width * 0.7 + drift,
        height * 0.18,
        0,
        width * 0.7 + drift,
        height * 0.18,
        Math.max(width, height) * 0.7,
      );
      upper.addColorStop(0, "rgba(86, 205, 255, 0.22)");
      upper.addColorStop(0.34, "rgba(100, 121, 255, 0.14)");
      upper.addColorStop(0.64, "rgba(157, 102, 255, 0.08)");
      upper.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.fillStyle = upper;
      context.fillRect(0, 0, width, height);

      const lower = context.createRadialGradient(
        width * 0.15 - drift * 0.45,
        height * 0.82,
        0,
        width * 0.15 - drift * 0.45,
        height * 0.82,
        Math.max(width, height) * 0.54,
      );
      lower.addColorStop(0, "rgba(173, 111, 255, 0.13)");
      lower.addColorStop(0.48, "rgba(82, 180, 255, 0.09)");
      lower.addColorStop(1, "rgba(255, 255, 255, 0)");
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
          star.x += Math.sin(time * 0.00012 + star.phase) * 0.016 * star.depth;
          if (star.y > height + 5) {
            star.y = -5;
            star.x = Math.random() * width;
          }
        }

        const twinkle = reducedMotion
          ? 0.5
          : 0.42 + Math.sin(time * 0.0015 + star.phase) * 0.34;
        const alpha = Math.max(0.1, twinkle);
        const red = star.phase % 3 < 1 ? 84 : 124;
        const green = star.phase % 3 < 1 ? 172 : 132;
        const blue = 255;

        context.beginPath();
        context.arc(star.x, star.y, star.radius * star.depth, 0, Math.PI * 2);
        context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        context.fill();

        if (star.depth > 0.7 && !reducedMotion) {
          const glow = context.createRadialGradient(
            star.x,
            star.y,
            0,
            star.x,
            star.y,
            star.radius * 8,
          );
          glow.addColorStop(0, `rgba(118, 184, 255, ${alpha * 0.26})`);
          glow.addColorStop(1, "rgba(118, 184, 255, 0)");
          context.fillStyle = glow;
          context.beginPath();
          context.arc(star.x, star.y, star.radius * 8, 0, Math.PI * 2);
          context.fill();
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
