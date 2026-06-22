"use client";

import { useEffect, useRef } from "react";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

type Particle = {
  theta: number;
  phi: number;
  speed: number;
  offset: number;
  size: number;
  hue: number;
};

const SIZE = 560;
const COUNT = 920;

export function NuboEnergyOrb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let frame = 0;
    let phase: NuboVoicePhase = "idle";
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width = `${SIZE}px`;
    canvas.style.height = `${SIZE}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const particles: Particle[] = Array.from({ length: COUNT }, (_, index) => ({
      theta: Math.random() * Math.PI * 2,
      phi: Math.acos(2 * Math.random() - 1),
      speed: 0.00035 + Math.random() * 0.00135,
      offset: index * 0.014 + Math.random() * 6,
      size: 0.45 + Math.random() * 1.65,
      hue: Math.random(),
    }));

    const onPhase = (event: Event) => {
      const next = (event as CustomEvent<{ phase?: NuboVoicePhase }>).detail?.phase;
      if (next) phase = next;
    };

    const getPower = () => {
      if (phase === "connecting") return 1.2;
      if (phase === "listening") return 1.38;
      if (phase === "thinking") return 1.62;
      if (phase === "speaking") return 2.92;
      if (phase === "error") return 0.68;
      return 1;
    };

    const drawTrack = (
      time: number,
      radius: number,
      tilt: number,
      offset: number,
      alpha: number,
      violet: boolean,
    ) => {
      const cx = SIZE / 2;
      const cy = SIZE / 2;
      ctx.beginPath();
      for (let index = 0; index <= 140; index += 1) {
        const ratio = index / 140;
        const angle = ratio * Math.PI * 2 + time * 0.00031 + offset;
        const localRadius = radius + Math.sin(angle * 4 + time * 0.001) * 8;
        const x = cx + Math.cos(angle) * localRadius;
        const y = cy + Math.sin(angle) * localRadius * tilt;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = violet
        ? `rgba(195,78,255,${alpha})`
        : `rgba(86,196,255,${alpha})`;
      ctx.lineWidth = 1.1;
      ctx.shadowColor = violet ? "#c454ff" : "#64d5ff";
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const draw = (time: number) => {
      const power = getPower();
      const cx = SIZE / 2;
      const cy = SIZE / 2;
      const pulse = 1 + Math.sin(time * 0.00245) * 0.026 * power;
      const coreRadius = 132 * pulse;
      const cloudRadius = 182 + power * 4;
      const rotation = time * 0.000115 * power;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      const aura = ctx.createRadialGradient(cx, cy, 20, cx, cy, 262);
      aura.addColorStop(0, `rgba(184,234,255,${0.15 * power})`);
      aura.addColorStop(0.3, `rgba(73,128,255,${0.18 * power})`);
      aura.addColorStop(0.58, `rgba(151,58,255,${0.16 * power})`);
      aura.addColorStop(1, "rgba(10,3,36,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, 264, 0, Math.PI * 2);
      ctx.fill();

      drawTrack(time, 173, 0.4, 0.1, 0.31 * power, false);
      drawTrack(time, 194, 0.57, 1.35, 0.25 * power, true);
      drawTrack(time, 216, 0.32, 2.65, 0.19 * power, false);
      drawTrack(time, 235, 0.72, 4.05, 0.13 * power, true);
      drawTrack(time, 249, 0.48, 5.25, 0.09 * power, false);

      for (const particle of particles) {
        const theta = particle.theta + rotation + Math.sin(time * particle.speed + particle.offset) * 0.035;
        const phi = particle.phi + Math.sin(time * 0.00039 + particle.offset) * 0.09;
        const x3 = Math.sin(phi) * Math.cos(theta);
        const y3 = Math.cos(phi);
        const z3 = Math.sin(phi) * Math.sin(theta);
        const depth = (z3 + 1) * 0.5;
        const perspective = 0.66 + depth * 0.46;
        const localRadius = cloudRadius + Math.sin(time * 0.00072 + particle.offset) * 9;
        const x = cx + x3 * localRadius * perspective;
        const y = cy + y3 * localRadius * perspective;
      const alpha = Math.min((0.11 + depth * 0.76) * power, 0.98);
        const red = 90 + Math.floor(particle.hue * 100 + depth * 70);
        const green = 72 + Math.floor(depth * 126);

        ctx.beginPath();
        ctx.arc(x, y, particle.size * (0.5 + depth * 0.82), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${red},${green},255,${alpha})`;
      ctx.fill();

        if (depth > 0.45) {
          const trail = 9 + depth * 25 * Math.min(power, 2.1);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - Math.sin(theta) * trail, y + Math.cos(theta) * trail * 0.4);
          ctx.strokeStyle = particle.hue > 0.5
            ? `rgba(92,202,255,${0.04 + depth * 0.18})`
            : `rgba(196,72,255,${0.035 + depth * 0.17})`;
          ctx.lineWidth = 0.42 + depth * 0.9;
          ctx.stroke();
        }
      }

      const shell = ctx.createRadialGradient(cx - 38, cy - 50, 5, cx, cy, coreRadius);
      shell.addColorStop(0, "rgba(255,255,255,.99)");
      shell.addColorStop(0.08, "rgba(184,246,255,.98)");
      shell.addColorStop(0.25, "rgba(63,179,255,.95)");
      shell.addColorStop(0.48, "rgba(80,88,255,.93)");
      shell.addColorStop(0.7, "rgba(157,45,255,.9)");
      shell.addColorStop(0.88, "rgba(51,10,108,.97)");
      shell.addColorStop(1, "rgba(3,5,19,1)");
      ctx.fillStyle = shell;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      for (let index = 0; index < 22; index += 1) {
        const angle = time * (0.00042 + index * 0.000012) + index * 0.41;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * 24, cy + Math.sin(angle) * 24);
        ctq.quadraticCurveTo(
          cx + Math.cos(angle + 0.55) * coreRadius * 0.48,
          cy + Math.sin(angle + 0.55) * coreRadius * 0.48,
          cx + Math.cos(angle + 1.18) * coreRadius * 0.76,
          cy + Math.sin(angle + 1.18) * coreRadius * 0.76,
        );
        ctx.strokeStyle = index % 2
          ? `rgba(82,215,255,${0.08 + power * 0.05})`
          : `rgba(210,70,255,${0.07 + power * 0.045})`;
        ctx.lineWidth = 0.65 + (index % 4) * 0.24;
        ctx.stroke();
      }

      const scanY = ((time * 0.0002 * power) % 1) * coreRadius * 2 - coreRadius;
      const scan = ctx.createLinearGradient(cx, cy + scanY - 22, cx, cy + scanY + 22);
      scan.addColorStop(0, "rgba(79,203,255,0)");
      scan.addColorStop(0.5, `rgba(200,246,255,${0.54 * power})`);
      scan.addColorStop(1, "rgba(143,68,255,0)");
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = scan;
      ctx.fillRect(cx - coreRadius, cy + scanY - 24, coreRadius * 2, 48);
      ctx.restore();

      ctx.restore();
      frame = window.requestAnimationFrame(draw);
    };

    window.addEventListener("nubo-voice-phase", onPhase);
    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("nubo-voice-phase", onPhase);
    };
  }, []);

  return <div className="nubo-energy-orb" aria-hidden="true"><canvas ref={canvasRef} /></div>;
}
