"use client";

import {
  OpenAIRealtimeWebRTC,
  RealtimeSession,
} from "@openai/agents/realtime";
import { useEffect, useRef, useState } from "react";
import {
  notifyNuboVoicePhase,
  primeBrowserActions,
} from "@/lib/browser-action-bridge";
import { nuboAgent } from "@/lib/nubo-agent";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

export function OpenAIVoiceConsole() {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (state === "idle") notifyNuboVoicePhase("idle");
    else if (state === "connecting") notifyNuboVoicePhase("connecting");
    else if (state === "connected") notifyNuboVoicePhase("listening");
    else notifyNuboVoicePhase("error");
  }, [state]);

  const connect = async () => {
    primeBrowserActions();
    setError("");
    setState("connecting");
    try {
      const transport = new OpenAIRealtimeWebRTC({
        baseUrl: `${window.location.origin}/api/realtime-call`,
        useInsecureApiKey: true,
      });
      const session = new RealtimeSession(nuboAgent, {
        model: "gpt-realtime-2",
        transport,
        config: { audio: { output: { voice: "marin" } } },
      });
      session.on("error", (event) => {
        console.error("NUBO OpenAI session error", event);
        setError("OpenAI語音連線失敗，請查看PowerShell錯誤訊息。");
        setState("error");
      });
      await session.connect({ apiKey: "nubo-server-proxy" });
      sessionRef.current = session;
      setState("connected");
    } catch (cause) {
      console.error("NUBO OpenAI connection failed", cause);
      setError(cause instanceof Error ? cause.message : "OpenAI語音連線失敗");
      setState("error");
    }
  };

  const disconnect = () => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setState("idle");
    setError("");
  };

  const stateLabel = {
    idle: ["NUBO待命", "OpenAI Realtime備援語音"],
    connecting: ["正在連接OpenAI", "請允許麥克風與彈出式視窗"],
    connected: ["NUBO正在聆聽", "音樂、網頁與桌面工具已啟用"],
    error: ["OpenAI語音未連線", "請檢查API額度與PowerShell訊息"],
  }[state];

  return (
    <section className="console voice-console" aria-live="polite">
      <div className="orb-wrap">
        <div className={`orb ${state === "connected" ? "active" : ""}`} />
      </div>
      <div className="status">
        <strong>{stateLabel[0]}</strong>
        <span>{stateLabel[1]}</span>
      </div>
      <div className="actions">
        <button className="primary" onClick={connect} disabled={state === "connecting" || state === "connected"}>
          {state === "connecting" ? "連線中…" : "啟動NUBO"}
        </button>
        <button className="secondary" onClick={disconnect} disabled={state !== "connected"}>
          結束對話
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <div className="capabilities">
        <div className="capability"><b>OpenAI Realtime</b><small>備援語音與瀏覽器動作橋接。</small></div>
        <div className="capability"><b>桌面與網頁</b><small>開啟網站及安全白名單Windows工具。</small></div>
        <div className="capability"><b>安全權限</b><small>高風險外部操作仍需再次確認。</small></div>
      </div>
    </section>
  );
}
