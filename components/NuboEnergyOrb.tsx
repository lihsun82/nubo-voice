"use client";

import { useEffect, useRef } from "react";
import {
  createOrbParticles,
  getOrbPower,
  ORB_SIZE,
} from "@/lib/orb-config";
import { renderNuboOrb } from "@/lib/orb-render";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

export function NuboEnergyOrb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let animationFrame = 0;
    let phase: NuboVoicePhase = "idle";
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    const particles = createOrbParticles();

    canvas.width = ORB_SIZE * dpr;
    canvas.height = ORB_SIZE * dpr;
    canvas.style.width = `${ORB_SIZE}px`;
    canvas.style.height = `${ORB_SIZE}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const onPhase = (event: Event) => {
      const next = (event as CustomEvent<{ phase?: NuboVoicePhase }>).detail?.phase;
      if (next) phase = next;
    };

    const draw = (time: number) => {
      renderNuboOrb(ctx, particles, time, getOrbPower(phase));
      animationFrame = window.requestAnimationFrame(draw);
    };

    window.addEventListener("nubo-voice-phase", onPhase);
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("nubo-voice-phase", onPhase);
    };
  }, []);

  return (
    <div className="nubo-energy-orb" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
