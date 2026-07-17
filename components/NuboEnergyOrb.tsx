"use client";

import { useEffect, useRef } from "react";
import {
  createOrbParticles,
  getOrbPower,
  ORB_SIZE,
} from "@/lib/orb-config";
import { renderNuboOrb } from "@/lib/orb-render";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

function isLowPowerDevice() {
  const coarse = window.matchMedia(
    "(pointer: coarse) and (max-width: 1100px)",
  ).matches;
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

  return coarse || reducedMotion || lowCpu || slowNetwork;
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

    const lowPower = isLowPowerDevice();
    const dpr = lowPower
      ? 1
      : Math.min(window.devicePixelRatio || 1, 1.5);
    const particles = createOrbParticles().slice(
      0,
      lowPower ? 180 : 920,
    );
    const frameInterval = lowPower ? 50 : 1000 / 60;

    canvas.width = ORB_SIZE * dpr;
    canvas.height = ORB_SIZE * dpr;
    canvas.style.width = `${ORB_SIZE}px`;
    canvas.style.height = `${ORB_SIZE}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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

      if (time - lastFrameAt >= frameInterval) {
        lastFrameAt = time;
        renderNuboOrb(
          ctx,
          particles,
          time,
          getOrbPower(phase),
        );
      }

      animationFrame = window.requestAnimationFrame(draw);
    };

    window.addEventListener("nubo-voice-phase", onPhase);
    document.addEventListener(
      "visibilitychange",
      onVisibilityChange,
    );
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("nubo-voice-phase", onPhase);
      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange,
      );
    };
  }, []);

  return (
    <div className="nubo-energy-orb" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
