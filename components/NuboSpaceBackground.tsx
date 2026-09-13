"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  radius: number;
  depth: number;
  speed: number;
  phase: number;
  tone: "blue" | "violet" | "gold";
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
      const count = reducedMotion ? 64 : coarse ? 190 : 340;
      stars = Array.from({ length: count }, (_, index) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.45 + Math.random() * 1.8,
        depth: 0.22 + Math.random() * 0.78,
        speed: 0.01 + Math.random() * 0.04,
        phase: Math.random() * Math.PI * 2,
        tone: index % 11 === 0 ? "gold" : index % 3 === 0 ? "violet" : "blue",
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

    const draw = (time: number) => {
      frame = 0;
      if (!visible) return;

      context.clearRect(0, 0, width, height);

      for (const star of stars) {
        if (!reducedMotion) {
          star.y += star.speed * star.depth;
          star.x += Math.sin(time * 0.00012 + star.phase) * 0.018 * star.depth;
          if (star.y > height + 6) {
            star.y = -6;
            star.x = Math.random() * width;
          }
        }

        const twinkle = reducedMotion
          ? 0.46
          : 0.38 + Math.sin(time * 0.00155 + star.phase) * 0.34;
        const alpha = Math.max(0.08, twinkle);
        const color =
          star.tone === "gold"
            ? [220, 170, 74]
            : star.tone === "violet"
              ? [142, 116, 255]
              : [82, 164, 255];

        context.beginPath();
        context.arc(star.x, star.y, star.radius * star.depth, 0, Math.PI * 2);
        context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
        context.fill();

        if (star.depth > 0.68 && !reducedMotion) {
          const glow = context.createRadialGradient(
            star.x,
            star.y,
            0,
            star.x,
            star.y,
            star.radius * 9,
          );
          glow.addColorStop(
            0,
            `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha * 0.22})`,
          );
          glow.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
          context.fillStyle = glow;
          context.beginPath();
          context.arc(star.x, star.y, star.radius * 9, 0, Math.PI * 2);
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
