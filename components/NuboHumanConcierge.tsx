"use client";

import { useEffect, useState } from "react";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

const PHASE_COPY: Record<NuboVoicePhase, { title: string; detail: string }> = {
  idle: { title: "NUBO 真人智慧禮賓", detail: "溫柔待命中，隨時為你服務" },
  connecting: { title: "正在喚醒 NUBO", detail: "正在建立即時語音連線" },
  listening: { title: "NUBO 正在聆聽", detail: "你可以直接說出需求" },
  thinking: { title: "NUBO 正在處理", detail: "正在理解並執行你的任務" },
  speaking: { title: "NUBO 正在回覆", detail: "女性溫柔語音已啟用" },
  error: { title: "NUBO 安全待命", detail: "語音服務暫時未連線" },
};

const AVATAR_VIDEO_URL = process.env.NEXT_PUBLIC_NUBO_AVATAR_VIDEO_URL?.trim() ?? "";

export function NuboHumanConcierge() {
  const [phase, setPhase] = useState<NuboVoicePhase>("idle");
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    const handlePhase = (event: Event) => {
      const next = (event as CustomEvent<{ phase?: NuboVoicePhase }>).detail?.phase;
      if (next) setPhase(next);
    };

    window.addEventListener("nubo-voice-phase", handlePhase);
    return () => window.removeEventListener("nubo-voice-phase", handlePhase);
  }, []);

  const copy = PHASE_COPY[phase];

  return (
    <section className={`human-concierge human-concierge--${phase}`} aria-live="polite">
      <div className="human-concierge__stage">
        <div className="human-concierge__halo" aria-hidden="true" />
        {AVATAR_VIDEO_URL ? (
          <video
            className="human-concierge__media is-ready"
            src={AVATAR_VIDEO_URL}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-label="NUBO 真人智慧禮賓動態影像"
          />
        ) : (
          <img
            className={`human-concierge__media${imageReady ? " is-ready" : ""}`}
            src="/nubo-human-v1.svg"
            alt="NUBO 女性真人智慧禮賓"
            onLoad={() => setImageReady(true)}
          />
        )}
        <div className="human-concierge__scan" aria-hidden="true" />
        <div className="human-concierge__voice" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="human-concierge__badge">REAL AVATAR READY</div>
      </div>
      <div className="human-concierge__status">
        <strong>{copy.title}</strong>
        <span>{copy.detail}</span>
      </div>
      <style jsx global>{`
        .console > .orb-wrap { display: none !important; }
        .human-concierge {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(135,151,255,.24);
          border-radius: clamp(24px,5vw,36px);
          background: radial-gradient(circle at 50% 22%,rgba(116,115,255,.24),transparent 34%),linear-gradient(180deg,rgba(17,23,48,.96),rgba(7,11,24,.96));
          box-shadow: 0 30px 90px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.08);
        }
        .human-concierge__stage {
          position: relative;
          width: 100%;
          height: clamp(390px,76vw,650px);
          display: grid;
          place-items: end center;
          isolation: isolate;
        }
        .human-concierge__halo {
          position: absolute;
          width: min(82vw,560px);
          aspect-ratio: 1;
          border: 1px solid rgba(138,139,255,.3);
          border-radius: 50%;
          box-shadow: 0 0 70px rgba(98,104,255,.22),inset 0 0 60px rgba(91,100,255,.1);
          animation: nubo-halo 7s linear infinite;
        }
        .human-concierge__media {
          position: relative;
          z-index: 2;
          height: 100%;
          width: auto;
          max-width: 100%;
          object-fit: contain;
          object-position: center bottom;
          opacity: 0;
          transform: translateY(10px) scale(.99);
          transition: opacity .45s ease, transform .6s ease, filter .35s ease;
          filter: saturate(.98) contrast(1.02);
          user-select: none;
          pointer-events: none;
        }
        .human-concierge__media.is-ready {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        .human-concierge--listening .human-concierge__media { filter: saturate(1.02) contrast(1.04) brightness(1.02); }
        .human-concierge--thinking .human-concierge__media { filter: saturate(.94) contrast(1.04) hue-rotate(3deg); }
        .human-concierge--speaking .human-concierge__media { filter: saturate(1.05) contrast(1.03) brightness(1.02); }
        .human-concierge__scan {
          position: absolute;
          z-index: 3;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(180deg,transparent 0 46%,rgba(156,167,255,.12) 50%,transparent 54%);
          transform: translateY(-100%);
          animation: nubo-scan 5.5s ease-in-out infinite;
          mix-blend-mode: screen;
        }
        .human-concierge__voice {
          position: absolute;
          z-index: 5;
          left: 50%;
          bottom: 20px;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 5px;
          height: 30px;
          padding: 6px 12px;
          border: 1px solid rgba(170,181,255,.22);
          border-radius: 999px;
          background: rgba(8,13,29,.62);
          backdrop-filter: blur(14px);
          opacity: .55;
        }
        .human-concierge__voice i { display:block;width:3px;height:7px;border-radius:9px;background:#afb8ff; }
        .human-concierge--speaking .human-concierge__voice { opacity:1;box-shadow:0 0 28px rgba(120,130,255,.35); }
        .human-concierge--speaking .human-concierge__voice i { animation:nubo-wave .55s ease-in-out infinite alternate; }
        .human-concierge--speaking .human-concierge__voice i:nth-child(2){animation-delay:-.2s}.human-concierge--speaking .human-concierge__voice i:nth-child(3){animation-delay:-.36s}.human-concierge--speaking .human-concierge__voice i:nth-child(4){animation-delay:-.12s}.human-concierge--speaking .human-concierge__voice i:nth-child(5){animation-delay:-.28s}
        .human-concierge__badge {
          position:absolute;z-index:6;top:16px;left:16px;padding:7px 11px;border:1px solid rgba(179,187,255,.22);border-radius:999px;color:#cbd1ff;background:rgba(8,13,29,.55);backdrop-filter:blur(12px);font-size:10px;font-weight:750;letter-spacing:.14em;
        }
        .human-concierge__status { position:relative;z-index:6;display:grid;gap:4px;padding:18px 20px 20px;text-align:center;border-top:1px solid rgba(255,255,255,.08);background:rgba(6,10,22,.72);backdrop-filter:blur(20px); }
        .human-concierge__status strong { font-size:clamp(18px,3.2vw,24px); }
        .human-concierge__status span { color:#aeb8d3;font-size:clamp(12px,2vw,14px); }
        @keyframes nubo-halo { to { transform:rotate(360deg); } }
        @keyframes nubo-scan { 0%,70%{transform:translateY(-100%);opacity:0}78%{opacity:.8}100%{transform:translateY(100%);opacity:0} }
        @keyframes nubo-wave { to { height:20px; } }
        @media (max-width:680px){.human-concierge__stage{height:min(118vw,570px)}.human-concierge__badge{top:12px;left:12px}}
        @media (prefers-reduced-motion:reduce){.human-concierge__halo,.human-concierge__scan,.human-concierge__voice i{animation:none!important}}
      `}</style>
    </section>
  );
}
