"use client";

import { useEffect, useRef } from "react";
import type { NuboVoicePhase } from "@/lib/browser-action-bridge";

type Particle = {
  theta: number;
  phi: number;
  speed: number;
  offset: number;
  size: number;
  hueBias: number;
};

const SIZE = 460;
const PARTICLE_COUNT = 720;

export function NuboEnergyOrb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrame = 0;
    let phase: NuboVoicePhase = "idle";
    let dpr = 1;

    const particles: Particle[] = Array.from(
      { length: PARTICLE_COUNT },
      (_, index) => ({
        theta: Math.random() * Math.PI * 2,
        phi: Math.acos(2 * Math.random() - 1),
        speed: 0.00042 + Math.random() * 0.0014,
        offset: index * 0.017 + Math.random() * 5,
        size: 0.5 + Math.random() * 1.7,
        hueBias: Math.random(),
      }),
    );

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.7);
      canvas.width = Math.floor(SIZE * dpr);
      canvas.height = Math.floor(SIZE * dpr);
      canvas.style.width = `${SIZE}px`;
      canvas.style.height = `${SIZE}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onPhase = (event: Event) => {
      const next = (event as CustomEvent<{ phase?: NuboVoicePhase }>).detail?.phase;
      if (next) phase = next;
    };

    const intensity = () => {
      if (phase === "connecting") return 1.2;
      if (phase === "listening") return 1.38;
      if (phase === "thinking") return 1.62;
      if (phase === "speaking") return 1.92;
      if (phase === "error") return 0.68;
      return 1;
    };

    const drawEnergyTrack = (
      time: number,
      cx: number,
      cy: number,
      radius: number,
      tilt: number,
      rotationOffset: number,
      alpha: number,
    ) => {
      ctx.beginPath();
      for (let index = 0; index <= 140; index += 1) {
        const ratio = index / 140;
        const angle = ratio * Math.PI * 2 + time * 0.00034 + rotationOffset;
        const wave = Math.sin(angle * 4 + time * 0.0011 + rotationOffset) * 7;
        const localRadius = radius + wave;
        const x = cx + Math.cos(angle) * localRadius;
        const y = cy + Math.sin(angle) * localRadius * tilt;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(91, 188, 255, ${alpha})`;
      ctx.lineWidth = 1.15;
      ctx.shadowColor = "rgba(102, 188, 255, .9)";
      ctx.shadowBlur = 13;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const drawCoreFilaments = (
      time: number,
      cx: number,
      cy: number,
      coreRadius: number,
      power: number,
    ) => {
      for (let index = 0; index < 16; index += 1) {
        const angle = time * (0.00046 + index * 0.000016) + index * 0.49;
        const startRadius = 18 + (index % 4) * 7;
        const middleRadius = coreRadius * (0.44 + (index % 3) * 0.08);
        const endRadius = coreRadius * (0.72 + Math.sin(time * 0.0012 + index) * 0.08);

        ctx.beginPath();
        ctx.moveTo(
          cx + Math.cos(angle) * startRadius,
          cy + Math.sin(angle) * startRadius,
        );
        ctx.bezierCurveTo(
          cx + Math.cos(angle + 0.5) * middleRadius,
          cy + Math.sin(angle + 0.5) * middleRadius,
          cx + Math.cos(angle + 0.95) * middleRadius,
          cy + Math.sin(angle + 0.95) * middleRadius,
          cx + Math.cos(angle + 1.25) * endRadius,
          cy + Math.sin(angle + 1.25) * endRadius,
        );
        ctx.strokeStyle = index % 2
          ? `rgba(91, 218, 255, ${0.13 + power * 0.055})`
          : `rgba(205, 81, 255, ${0.11 + power * 0.05})`;
        ctx.lineWidth = 0.7 + (index % 3) * 0.3;
        ctx.shadowColor = index % 2 ? "#5edcff" : "#c94fff";
        ctx.shadowBlur = 9;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    };

    const draw = (time: number) => {
      const power = intensity();
      const cx = SIZE / 2;
      const cy = SIZE / 2;
      const coreRadius = 108 * (1 + Math.sin(time * 0.0025) * 0.027 * power);
      const particleRadius = 148 + power * 5;
      const rotation = time * 0.00013 * power;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      const aura = ctx.createRadialGradient(cx, cy, 18, cx, cy, 213);
      aura.addColorStop(0, `rgba(165, 224, 255, ${0.17 * power})`);
      aura.addColorStop(0.28, `rgba(84, 129, 255, ${0.18 * power})`);
      aura.addColorStop(0.56, `rgba(152, 66, 255, ${0.17 * power})`);
      aura.addColorStop(0.82, `rgba(200, 53, 255, ${0.075 * power})`);
      aura.addColorStop(1, "rgba(15, 6, 40, 0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, 216, 0, Math.PI * 2);
      ctx.fill();

      drawEnergyTrack(time, cx, cy, 143, 0.42, 0.1, 0.34 * power);
      drawEnergyTrack(time, cx, cy, 163, 0.58, 1.9, 0.25 * power);
      drawEnergyTrack(time, cx, cy, 181, 0.34, 3.8, 0.17 * power);
      drawEnergyTrack(time, cx, cy, 194, 0.72, 5.2, 0.1 * power);

      for (const particle of particles) {
        const drift = Math.sin(time * particle.speed + particle.offset) * 0.24;
        const theta = particle.theta + rotation + drift * 0.14;
        const phi = particle.phi + Math.sin(time * 0.00042 + particle.offset) * 0.09;
        const x3 = Math.sin(phi) * Math.cos(theta);
        const y3 = Math.cos(phi);
        const z3 = Math.sin(phi) * Math.sin(theta);
        const depth = (z3 + 1) * 0.5;
        const perspective = 0.68 + depth * 0.44;
        const localRadius = particleRadius + Math.sin(time * 0.0008 + particle.offset) * 8;
        const x = cx + x3 * localRadius * perspective;
        const y = cy + y3 * localRadius * perspective;
        const alpha = Math.min((0.13 + depth * 0.74) * power, 0.96);
        const red = 100 + Math.floor((particle.hueBias * 80 + depth * 85));
        const green = 80 + Math.floor(depth * 120);

        ctx.beginPath();
        ctx.arc(x, y, particle.size * (0.52 + depth * 0.78), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${red}, ${green}, 255, ${alpha})`;
        ctx.fill();

        if (depth > 0.48) {
          const trail = 8 + depth * 22 * power;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(
            x - Math.sin(theta) * trail,
            y + Math.cos(theta) * trail * 0.38,
          );
          ctx.strokeStyle = particle.hueBias > 0.5
            ? `rgba(98, 199, 255, ${0.045 + depth * 0.17})`
            : `rgba(190, 83, 255, ${0.04 + depth * 0.15})`;
          ctx.lineWidth = 0.45 + depth * 0.85;
          ctx.stroke();
        }
      }

      const shell = ctx.createRadialGradient(
        cx - 31,
        cy - 40,
        4,
        cx,
        cy,
        coreRadius,
      );
      shell.addColorStop(0, "rgba(255,255,255,.98)");
      shell.addColorStop(0.055, "rgba(192,246,255,.97)");
      shell.addColorStop(0.2, "rgba(72,181,255,.94)");
      shell.addColorStop(0.44, "rgba(82,96,255,.92)");
      shell.addColorStop(0.68, "rgba(149,55,255,.88)");
      shell.addColorStop(0.86, "rgba(53,15,110,.96)");
      shell.addColorStop(1, "rgba(4,6,20,1)");
      ctx.fillStyle = shell;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      const innerGlow = ctx.createRadialGradient(cx, cy, 4, cx, cy, coreRadius * 0.88);
      innerGlow.addColorStop(0, `rgba(203, 247, 255, ${0.72 * power})`);
      innerGlow.addColorStop(0.25, `rgba(57, 164, 255, ${0.22 * power})`);
      innerGlow.addColorStop(0.62, `rgba(169, 63, 255, ${0.21 * power})`);
      innerGlow.addColorStop(1, "rgba(10,4,35,0)");
      ctx.fillStyle = innerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 0.9, 0, Math.PI * 2);
      ctx.fill();

      drawCoreFilaments(time, cx, cy, coreRadius, power);

      const scanPosition = ((time * 0.00021 * power) % 1) * coreRadius * 2 - coreRadius;
      const scanGradient = ctx.createLinearGradient(
        cx,
        cy + scanPosition - 19,
        cx,
        cy + scanPosition + 19,
      );
      scanGradient.addColorStop(0, "rgba(77, 203, 255, 0)");
      scanGradient.addColorStop(0.42, `rgba(100, 224, 255, ${0.2 * power})`);
      scanGradient.addColorStop(0.5, `rgba(183, 239, 255, ${0.58 * power})`);
      scanGradient.addColorStop(0.58, `rgba(132, 96, 255, ${0.23 * power})`);
      scanGradient.addColorStop(1, "rgba(141, 73, 255, 0)");
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = scanGradient;
      ctx.fillRect(cx - coreRadius, cy + scanPosition - 21, coreRadius * 2, 42);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius + 1, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(120, 214, 255, ${0.32 * power})`;
      ctx.lineWidth = 1.7;
      ctx.shadowColor = "#71dcff";
      ctx.shadowBlur = 22;
      ctx.stroke();

      ctx.restore();
      animationFrame = window.requestAnimationFrame(draw);
    };

    resize();
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
