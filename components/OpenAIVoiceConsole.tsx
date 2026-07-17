"use client";

import {
  OpenAIRealtimeWebRTC,
  RealtimeSession,
} from "@openai/agents/realtime";
import { useRef, useState } from "react";
import { nuboAgent } from "@/lib/nubo-agent";

type ConnectionState = "idle" | "connecting" | "connected" | "error";
type OpenAIVoice = "marin" | "cedar" | "coral" | "sage";

const OPENAI_VOICE_KEY = "nubo_openai_voice_v1";

function readOpenAIVoice(): OpenAIVoice {
  const stored = window.localStorage.getItem(OPENAI_VOICE_KEY);
  if (
    stored === "cedar" ||
    stored === "coral" ||
    stored === "sage"
  ) {
    return stored;
  }
  return "marin";
}

export function OpenAIVoiceConsole() {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [voiceLabel, setVoiceLabel] = useState("Marin高擬人語音");

  const connect = async () => {
    setError("");
    setState("connecting");
    try {
      const voice = readOpenAIVoice();
      setVoiceLabel(
        voice === "cedar"
          ? "Cedar沉穩專業"
          : voice === "coral"
            ? "Coral明亮有活力"
            : voice === "sage"
              ? "Sage知性柔和"
              : "Marin高擬人自然",
      );

      const transport = new OpenAIRealtimeWebRTC({
        baseUrl:
          `${window.location.origin}/api/realtime-call` +
          `?voice=${encodeURIComponent(voice)}`,
        useInsecureApiKey: true,
      });
      const session = new RealtimeSession(nuboAgent, {
        model: "gpt-realtime-2",
        transport,
        config: { audio: { output: { voice } } },
      });
      session.on("error", (event) => {
        console.error("NUBO backup voice session error", event);
        setError("OpenAI擬人語音連線失敗，請檢查API額度或切回Gemini。");
        setState("error");
      });
      await session.connect({ apiKey: "nubo-server-proxy" });
      sessionRef.current = session;
      setState("connected");
    } catch (cause) {
      console.error("NUBO backup voice connection failed", cause);
      setError(cause instanceof Error ? cause.message : "OpenAI擬人語音連線失敗");
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
    idle: [
      "NUBO待命",
      voiceLabel,
    ],
    connecting: [
      "NUBO正在連線",
      "請允許麥克風權限",
    ],
    connected: [
      "NUBO正在聆聽",
      voiceLabel,
    ],
    error: [
      "NUBO尚未連線",
      "請檢查服務與網路狀態",
    ],
  }[state];

  return (
    <section className="console" aria-live="polite">
      <div className="orb-wrap">
        <div className={`orb ${state === "connected" ? "active" : ""}`} />
      </div>
      <div className="status">
        <strong>{stateLabel[0]}</strong>
        <span>{stateLabel[1]}</span>
      </div>
      <div className="actions">
        <button className="primary" onClick={connect} disabled={state === "connecting" || state === "connected"}>
          {state === "connecting" ? "連線中…" : "啟動 NUBO"}
        </button>
        <button className="secondary" onClick={disconnect} disabled={state !== "connected"}>
          結束對話
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <div className="capabilities">
        <div className="capability"><b>OpenAI擬人語音</b><small>可切換Marin、Cedar、Coral與Sage。</small></div>
        <div className="capability"><b>自然互動</b><small>適合陪伴、聊天與更有情緒的表達。</small></div>
        <div className="capability"><b>安全權限</b><small>高風險外部操作仍需再次確認。</small></div>
      </div>
    </section>
  );
}
