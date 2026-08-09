"use client";

import { useEffect, useRef } from "react";
import {
  createOrbParticles,
  getOrbPower,
  ORB_SIZE,
} from "@/lib/orb-config";
import { renderNuboOrb } from "@/lib/orb-render";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

function getRenderProfile() {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const lowCpu =
    typeof navigator.hardwareConcurrency === "number" &&
    navigator.hardwareConcurrency <= 4;
  const connection = (
    navigator as Navigator & {
      connection?: {
        saveData?: boolean;
        effectiveType?: string;
      };
    }
  ).connection;
  const slowNetwork =
    connection?.saveData === true ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g";

  if (reducedMotion) {
    return { particleCount: 420, frameInterval: 50, dpr: 1 };
  }

  if (lowCpu || slowNetwork) {
    return { particleCount: 520, frameInterval: 40, dpr: 1 };
  }

  const mobile = window.matchMedia("(pointer: coarse)").matches;
  return mobile
    ? {
        particleCount: 680,
        frameInterval: 1000 / 30,
        dpr: Math.min(window.devicePixelRatio || 1, 1.2),
      }
    : {
        particleCount: 1350,
        frameInterval: 1000 / 60,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      };
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

    let animationFrame = 0;
    let phase: NuboVoicePhase = "idle";
    let lastFrameAt = 0;
    let visible = document.visibilityState === "visible";

    const profile = getRenderProfile();
    const particles = createOrbParticles().slice(0, profile.particleCount);

    canvas.width = Math.floor(ORB_SIZE * profile.dpr);
    canvas.height = Math.floor(ORB_SIZE * profile.dpr);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.maxWidth = `${ORB_SIZE}px`;
    canvas.style.aspectRatio = "1 / 1";
    canvas.style.display = "block";
    canvas.style.margin = "0 auto";
    ctx.setTransform(profile.dpr, 0, 0, profile.dpr, 0, 0);

    const onPhase = (event: Event) => {
      const next = (
        event as CustomEvent<{ phase?: NuboVoicePhase }>
      ).detail?.phase;
      if (next) phase = next;
    };

    const onVisibilityChange = () => {
      visible = document.visibilityState === "visible";
      if (visible && !animationFrame) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    const draw = (time: number) => {
      animationFrame = 0;
      if (!visible) return;

      if (time - lastFrameAt >= profile.frameInterval) {
        lastFrameAt = time;
        renderNuboOrb(
          ctx,
          particles,
          time,
          getOrbPower(phase),
          phase,
        );
      }

      animationFrame = window.requestAnimationFrame(draw);
    };

    window.addEventListener("nubo-voice-phase", onPhase);
    document.addEventListener("visibilitychange", onVisibilityChange);
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("nubo-voice-phase", onPhase);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <div className="nubo-energy-orb" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
