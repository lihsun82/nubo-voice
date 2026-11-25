"use client";

import { useEffect, useRef } from "react";
import { createKioskOrbRenderer } from "@/lib/nubo-kiosk-orb-renderer";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

const SIZE = 220;
const FRAME_INTERVAL = 1000 / 30;

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

    const drawOrb = createKioskOrbRenderer(ctx);
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
    let size = SIZE;

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
          size = canvas.getBoundingClientRect().width || SIZE;
          const pixels = Math.max(1, Math.round(size * dpr));
          if (canvas.width !== pixels || canvas.height !== pixels) {
            canvas.width = pixels;
            canvas.height = pixels;
          }
          ctx.setTransform(pixels / size, 0, 0, pixels / size, 0, 0);
          needsResize = false;
        }
        const delta = Number.isFinite(elapsed) ? Math.min(elapsed / 1000, 0.05) : 0;
        lastPaint = timestamp;
        previousPhase = current;
        const sample = levels[current === "speaking" ? "output" : "input"];
        const measured = timestamp - sample.at < 220 ? sample.value : 0;
        drawOrb(size, current, measured, delta, motion.matches);
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
