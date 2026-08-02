"use client";

import { useEffect, useState } from "react";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

const PHASE_COPY: Record<NuboVoicePhase, { title: string; detail: string }> = {
  idle: { title: "NUBO 真人智慧禮賓", detail: "溫柔待命中，隨時為你服務" },
  connecting: { title: "正在喚醒 NUBO", detail: "正在建立即時語音連線" },
  listening: { title: "NUBO 正在聆聽", detail: "你可以直接說出需求" },
  thinking: { title: "NUBO 正在處理", detail: "正在理解並執行你的任務" },
  speaking: { title: "NUBO 正在回覆", detail: "女性溫柔語音與動態表情已啟用" },
  error: { title: "NUBO 安全待命", detail: "語音服務暫時未連線" },
};

export function NuboHumanConcierge() {
  const [phase, setPhase] = useState<NuboVoicePhase>("idle");
  const [imageReady, setImageReady] = useState(false);
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    const handlePhase = (event: Event) => {
      const next = (event as CustomEvent<{ phase?: NuboVoicePhase }>).detail?.phase;
      if (next) setPhase(next);
    };

    window.addEventListener("nubo-voice-phase", handlePhase);
    return () => window.removeEventListener("nubo-voice-phase", handlePhase);
  }, []);

  useEffect(() => {
    let timer = 0;
    let closeTimer = 0;

    const scheduleBlink = () => {
      const delay = 2800 + Math.random() * 3600;
      timer = window.setTimeout(() => {
        setBlink(true);
        closeTimer = window.setTimeout(() => {
          setBlink(false);
          scheduleBlink();
        }, 130 + Math.random() * 70);
      }, delay);
    };

    scheduleBlink();
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(closeTimer);
    };
  }, []);

  const copy = PHASE_COPY[phase];

  return (
    <section className={`human-concierge human-concierge--${phase}`} aria-live="polite">
      <div className="human-concierge__stage">
        <div className="human-concierge__halo" aria-hidden="true" />
        <div className={`human-concierge__avatar${imageReady ? " is-ready" : ""}`}>
          <img
            className="human-concierge__portrait"
            src="/nubo-human-v1.svg"
            alt="NUBO 女性真人智慧禮賓"
            onLoad={() => setImageReady(true)}
          />
          <span className={`human-concierge__eye human-concierge__eye--left${blink ? " is-blinking" : ""}`} aria-hidden="true" />
          <span className={`human-concierge__eye human-concierge__eye--right${blink ? " is-blinking" : ""}`} aria-hidden="true" />
          <span className="human-concierge__mouth" aria-hidden="true" />
        </div>
        <div className="human-concierge__scan" aria-hidden="true" />
        <div className="human-concierge__voice" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="human-concierge__badge">LIVE HUMAN · V16.2</div>
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
        .human-concierge__avatar {
          position: relative;
          z-index: 2;
          height: 100%;
          aspect-ratio: 4 / 5;
          max-width: 100%;
          opacity: 0;
          transform: translateY(16px) scale(.985);
          transition: opacity .55s ease,transform .75s cubic-bezier(.2,.8,.2,1),filter .35s ease;
          filter: saturate(.96) contrast(1.02);
        }
        .human-concierge__avatar.is-ready {
          opacity: 1;
          transform: translateY(0) scale(1);
          animation: nubo-breathe 5.6s ease-in-out infinite;
        }
        .human-concierge__portrait {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center bottom;
          user-select: none;
          pointer-events: none;
        }
        .human-concierge__eye {
          position: absolute;
          z-index: 4;
          top: 21.4%;
          width: 7.2%;
          height: 0;
          border-radius: 50%;
          background: linear-gradient(180deg,#c79073,#e1ad92 58%,#8d5c4b);
          opacity: 0;
          transform: translateY(-50%);
          transition: height 70ms ease,opacity 40ms linear;
          box-shadow: 0 1px 0 rgba(52,29,25,.5);
          pointer-events: none;
        }
        .human-concierge__eye--left { left: 42.2%; transform: translateY(-50%) rotate(2deg); }
        .human-concierge__eye--right { left: 51.9%; transform: translateY(-50%) rotate(-2deg); }
        .human-concierge__eye.is-blinking { height: 1.45%; opacity: .96; }
        .human-concierge__mouth {
          position: absolute;
          z-index: 4;
          left: 49.1%;
          top: 29.5%;
          width: 6.6%;
          height: .45%;
          transform: translate(-50%,-50%);
          border-radius: 50% 50% 58% 58%;
          background: radial-gradient(ellipse at 50% 35%,#a9484d 0 28%,#6e2028 52%,#321116 100%);
          opacity: 0;
          box-shadow: inset 0 1px rgba(255,180,185,.3),0 0 1px rgba(0,0,0,.55);
          pointer-events: none;
        }
        .human-concierge--speaking .human-concierge__avatar { animation: nubo-speaking 1.15s ease-in-out infinite; filter: saturate(1.07) contrast(1.035) brightness(1.03); }
        .human-concierge--speaking .human-concierge__mouth { opacity: .96; animation: nubo-mouth 420ms ease-in-out infinite alternate; }
        .human-concierge--listening .human-concierge__avatar { filter: saturate(1.02) contrast(1.04) brightness(1.025); }
        .human-concierge--listening .human-concierge__avatar { animation: nubo-listen 3.2s ease-in-out infinite; }
        .human-concierge--thinking .human-concierge__avatar { filter: saturate(.92) contrast(1.05) hue-rotate(4deg); animation: nubo-think 2.4s ease-in-out infinite; }
        .human-concierge__scan {
          position: absolute;
          z-index: 3;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(180deg,transparent 0 46%,rgba(156,167,255,.15) 50%,transparent 54%);
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
        @keyframes nubo-breathe { 0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.004)} }
        @keyframes nubo-speaking { 0%,100%{transform:translateY(0) rotate(0) scale(1)}50%{transform:translateY(-2px) rotate(.16deg) scale(1.006)} }
        @keyframes nubo-listen { 0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-2px) rotate(-.22deg)} }
        @keyframes nubo-think { 0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-1px) rotate(.28deg)} }
        @keyframes nubo-mouth { 0%{height:.5%;width:6.2%;border-radius:60%}45%{height:1.45%;width:5.8%}100%{height:2.15%;width:5.1%;border-radius:48% 48% 58% 58%} }
        @keyframes nubo-scan { 0%,70%{transform:translateY(-100%);opacity:0}78%{opacity:.8}100%{transform:translateY(100%);opacity:0} }
        @keyframes nubo-wave { to { height:20px; } }
        @media (max-width:680px){.human-concierge__stage{height:min(118vw,570px)}.human-concierge__badge{top:12px;left:12px}}
        @media (prefers-reduced-motion:reduce){.human-concierge__avatar,.human-concierge__halo,.human-concierge__scan,.human-concierge__voice i,.human-concierge__mouth{animation:none!important}.human-concierge__eye{display:none}}
      `}</style>
    </section>
  );
}
