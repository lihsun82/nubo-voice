"use client";

import { useEffect, useRef } from "react";
import type { NuboVoicePhase } from "@/lib/browser-action-bridge";

type OrbitParticle = {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  depth: number;
  phase: number;
};

const SIZE = 360;

export function NuboEnergyOrb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrame = 0;
    let voicePhase: NuboVoicePhase = "idle";
    let dpr = 1;

    const particles: OrbitParticle[] = Array.from({ length: 190 }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 104 + Math.random() * 48,
      speed: 0.00045 + Math.random() * 0.0015,
      size: 0.7 + Math.random() * 2.4,
      depth: Math.random(),
      phase: Math.random() * Math.PI * 2,
    }));

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = SIZE * dpr;
      canvas.height = SIZE * dpr;
      canvas.style.width = `${SIZE}px`;
      canvas.style.height = `${SIZE}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const onPhase = (event: Event) => {
      const next = (event as CustomEvent<{ phase?: NuboVoicePhase }>).detail?.phase;
      if (next) voicePhase = next;
    };

    const intensity = () => {
      if (voicePhase === "speaking") return 1.55;
      if (voicePhase === "thinking") return 1.38;
      if (voicePhase === "listening") return 1.22;
      if (voicePhase === "connecting") return 1.12;
      if (voicePhase === "error") return 0.72;
      return 1;
    };

    const drawStream = (
      time: number,
      cx: number,
      cy: number,
      baseRadius: number,
      offset: number,
      opacity: number,
    ) => {
      ctx.beginPath();
      for (let i = 0; i <= 90; i += 1) {
        const t = i / 90;
        const angle = t * Math.PI * 2 + time * 0.00038 + offset;
        const wave = Math.sin(angle * 3 + time * 0.0012 + offset) * 8;
        const radius = baseRadius + wave;
        const flatten = 0.48 + Math.sin(offset) * 0.08;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * flatten;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(101, 177, 255, ${opacity})`;
      ctx.lineWidth = 1.1;
      ctx.shadowColor = "rgba(93, 164, 255, .75)";
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const draw = (time: number) => {
      const power = intensity();
      const cx = SIZE / 2;
      const cy = SIZE / 2;
      const pulse = 1 + Math.sin(time * 0.0025) * 0.028 * power;
      const coreRadius = 82 * pulse;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      const aura = ctx.createRadialGradient(cx, cy, 20, cx, cy, 154);
      aura.addColorStop(0, `rgba(151, 210, 255, ${0.22 * power})`);
      aura.addColorStop(0.34, `rgba(112, 77, 255, ${0.22 * power})`);
      aura.addColorStop(0.68, `rgba(188, 57, 255, ${0.12 * power})`);
      aura.addColorStop(1, "rgba(20, 8, 48, 0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, 156, 0, Math.PI * 2);
      ctx.fill();

      drawStream(time, cx, cy, 111, 0.25, 0.32 * power);
      drawStream(time, cx, cy, 125, 2.05, 0.22 * power);
      drawStream(time, cx, cy, 138, 4.1, 0.16 * power);

      for (const particle of particles) {
        const angle = particle.angle + time * particle.speed * power;
        const wobble = Math.sin(time * 0.0013 + particle.phase) * 9;
        const depth = (Math.sin(angle + particle.phase) + 1) * 0.5;
        const radius = particle.radius + wobble;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * (0.52 + particle.depth * 0.18);
        const alpha = 0.2 + depth * 0.72;

        ctx.beginPath();
        ctx.arc(x, y, particle.size * (0.7 + depth * 0.6), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${120 + Math.floor(depth * 100)}, ${100 + Math.floor(depth * 80)}, 255, ${alpha})`;
        ctx.shadowColor = depth > 0.5 ? "#7fe7ff" : "#a64dff";
        ctx.shadowBlur = 7 + depth * 10;
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      const shell = ctx.createRadialGradient(
        cx - 25,
        cy - 32,
        5,
        cx,
        cy,
        coreRadius,
      );
      shell.addColorStop(0, "rgba(255,255,255,.98)");
      shell.addColorStop(0.05, "rgba(183,244,255,.98)");
      shell.addColorStop(0.2, "rgba(86,180,255,.92)");
      shell.addColorStop(0.48, "rgba(104,88,255,.9)");
      shell.addColorStop(0.72, "rgba(164,51,255,.84)");
      shell.addColorStop(0.9, "rgba(33,10,74,.95)");
      shell.addColorStop(1, "rgba(5,7,20,1)");
      ctx.fillStyle = shell;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      const innerEnergy = ctx.createRadialGradient(cx, cy, 3, cx, cy, coreRadius * 0.82);
      innerEnergy.addColorStop(0, `rgba(184, 242, 255, ${0.8 * power})`);
      innerEnergy.addColorStop(0.3, `rgba(70, 156, 255, ${0.22 * power})`);
      innerEnergy.addColorStop(0.64, `rgba(160, 57, 255, ${0.18 * power})`);
      innerEnergy.addColorStop(1, "rgba(12,5,40,0)");
      ctx.fillStyle = innerEnergy;
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 0.84, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 9; i += 1) {
        const angle = time * (0.0006 + i * 0.00003) + i * 0.75;
        const startRadius = 24 + i * 3;
        const endRadius = 72 + Math.sin(time * 0.001 + i) * 8;
        ctx.beginPath();
        ctx.moveTo(
          cx + Math.cos(angle) * startRadius,
          cy + Math.sin(angle) * startRadius,
        );
        ctx.quadraticCurveTo(
          cx + Math.cos(angle + 0.7) * 46,
          cy + Math.sin(angle + 0.7) * 46,
          cx + Math.cos(angle + 1.15) * endRadius,
          cy + Math.sin(angle + 1.15) * endRadius,
        );
        ctx.strokeStyle = `rgba(${i % 2 ? 107 : 202}, ${i % 2 ? 204 : 94}, 255, ${0.18 + 0.025 * power})`;
        ctx.lineWidth = 0.9 + (i % 3) * 0.35;
        ctx.shadowColor = i % 2 ? "#5edcff" : "#be55ff";
        ctx.shadowBlur = 9;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      const scanPosition = ((time * 0.00023 * power) % 1) * coreRadius * 2 - coreRadius;
      const scanGradient = ctx.createLinearGradient(
        cx,
        cy + scanPosition - 16,
        cx,
        cy + scanPosition + 16,
      );
      scanGradient.addColorStop(0, "rgba(80, 207, 255, 0)");
      scanGradient.addColorStop(0.5, `rgba(109, 224, 255, ${0.44 * power})`);
      scanGradient.addColorStop(1, "rgba(145, 85, 255, 0)");
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = scanGradient;
      ctx.fillRect(cx - coreRadius, cy + scanPosition - 18, coreRadius * 2, 36);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius + 1, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(118, 211, 255, ${0.38 * power})`;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = "#7bdbff";
      ctx.shadowBlur = 18;
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
