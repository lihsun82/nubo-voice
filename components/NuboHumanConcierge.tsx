"use client";

import { useEffect, useMemo, useState } from "react";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

const PHASE_COPY: Record<NuboVoicePhase, { title: string; detail: string }> = {
  idle: { title: "NUBO 真人智慧禮賓", detail: "溫柔待命中，隨時為你服務" },
  connecting: { title: "正在喚醒 NUBO", detail: "正在建立真人對話連線" },
  listening: { title: "NUBO 正在聆聽", detail: "你可以直接說出需求" },
  thinking: { title: "NUBO 正在處理", detail: "正在理解並執行你的任務" },
  speaking: { title: "NUBO 正在回覆", detail: "真人嘴型與表情由影像引擎同步" },
  error: { title: "NUBO 安全待命", detail: "真人服務暫時未連線" },
};

type TavusConversation = {
  conversationId: string;
  conversationUrl: string;
  meetingToken?: string;
};

export function NuboHumanConcierge() {
  const [phase, setPhase] = useState<NuboVoicePhase>("idle");
  const [imageReady, setImageReady] = useState(false);
  const [conversation, setConversation] = useState<TavusConversation | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handlePhase = (event: Event) => {
      const next = (event as CustomEvent<{ phase?: NuboVoicePhase }>).detail?.phase;
      if (next) setPhase(next);
    };

    window.addEventListener("nubo-voice-phase", handlePhase);
    return () => window.removeEventListener("nubo-voice-phase", handlePhase);
  }, []);

  useEffect(() => {
    return () => {
      if (!conversation?.conversationId) return;
      void fetch(
        `/api/tavus/conversation?conversationId=${encodeURIComponent(
          conversation.conversationId,
        )}`,
        { method: "DELETE", keepalive: true },
      );
    };
  }, [conversation?.conversationId]);

  const embeddedUrl = useMemo(() => {
    if (!conversation?.conversationUrl) return "";
    if (!conversation.meetingToken) return conversation.conversationUrl;
    const separator = conversation.conversationUrl.includes("?") ? "&" : "?";
    return `${conversation.conversationUrl}${separator}t=${encodeURIComponent(
      conversation.meetingToken,
    )}`;
  }, [conversation]);

  const startAvatar = async () => {
    if (starting || conversation) return;
    setStarting(true);
    setError("");
    setPhase("connecting");

    try {
      const response = await fetch("/api/tavus/conversation", {
        method: "POST",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "真人 NUBO 啟動失敗。");
      }

      setConversation(payload as TavusConversation);
      setPhase("listening");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "真人 NUBO 啟動失敗。");
      setPhase("error");
    } finally {
      setStarting(false);
    }
  };

  const stopAvatar = async () => {
    const conversationId = conversation?.conversationId;
    setConversation(null);
    setPhase("idle");
    if (!conversationId) return;

    await fetch(
      `/api/tavus/conversation?conversationId=${encodeURIComponent(conversationId)}`,
      { method: "DELETE" },
    ).catch(() => undefined);
  };

  const copy = PHASE_COPY[phase];

  return (
    <section className={`human-concierge human-concierge--${phase}`} aria-live="polite">
      <div className="human-concierge__stage">
        {embeddedUrl ? (
          <iframe
            className="human-concierge__live-frame"
            src={embeddedUrl}
            title="NUBO 真人智慧禮賓即時對話"
            allow="camera; microphone; autoplay; display-capture; fullscreen"
          />
        ) : (
          <img
            className={`human-concierge__media${imageReady ? " is-ready" : ""}`}
            src="/nubo-human-v1.svg"
            alt="NUBO 女性真人智慧禮賓"
            onLoad={() => setImageReady(true)}
          />
        )}
        <div className="human-concierge__badge">
          {embeddedUrl ? "LIVE DIGITAL HUMAN" : "REAL AVATAR READY"}
        </div>
      </div>

      <div className="human-concierge__status">
        <strong>{copy.title}</strong>
        <span>{copy.detail}</span>
        <div className="human-concierge__actions">
          {!conversation ? (
            <button className="primary" onClick={() => void startAvatar()} disabled={starting}>
              {starting ? "真人連線中…" : "啟動真人 NUBO"}
            </button>
          ) : (
            <button className="secondary" onClick={() => void stopAvatar()}>
              結束真人對話
            </button>
          )}
        </div>
        {error ? <div className="error">{error}</div> : null}
      </div>

      <style jsx global>{`
        .console > .orb-wrap { display: none !important; }
        .human-concierge {
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(135,151,255,.24);
          border-radius: clamp(24px,5vw,36px);
          background: linear-gradient(180deg,rgba(17,23,48,.98),rgba(7,11,24,.98));
          box-shadow: 0 30px 90px rgba(0,0,0,.42),inset 0 1px rgba(255,255,255,.08);
        }
        .human-concierge__stage {
          position: relative;
          width: 100%;
          height: clamp(390px,76vw,650px);
          display: grid;
          place-items: end center;
          background: radial-gradient(circle at 50% 22%,rgba(116,115,255,.2),transparent 38%);
        }
        .human-concierge__media {
          height: 100%;
          width: auto;
          max-width: 100%;
          object-fit: contain;
          object-position: center bottom;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity .45s ease,transform .55s ease;
        }
        .human-concierge__media.is-ready { opacity: 1; transform: translateY(0); }
        .human-concierge__live-frame {
          width: 100%;
          height: 100%;
          border: 0;
          background: #050812;
        }
        .human-concierge__badge {
          position:absolute;
          z-index:6;
          top:16px;
          left:16px;
          padding:7px 11px;
          border:1px solid rgba(179,187,255,.22);
          border-radius:999px;
          color:#cbd1ff;
          background:rgba(8,13,29,.7);
          backdrop-filter:blur(12px);
          font-size:10px;
          font-weight:750;
          letter-spacing:.14em;
          pointer-events:none;
        }
        .human-concierge__status {
          display:grid;
          gap:6px;
          padding:18px 20px 20px;
          text-align:center;
          border-top:1px solid rgba(255,255,255,.08);
          background:rgba(6,10,22,.82);
        }
        .human-concierge__status strong { font-size:clamp(18px,3.2vw,24px); }
        .human-concierge__status span { color:#aeb8d3;font-size:clamp(12px,2vw,14px); }
        .human-concierge__actions { margin-top:10px;display:flex;justify-content:center; }
        .human-concierge__actions button { min-width:min(100%,220px); }
        @media (max-width:680px){
          .human-concierge__stage{height:min(126vw,610px)}
          .human-concierge__badge{top:12px;left:12px}
        }
      `}</style>
    </section>
  );
}
