"use client";

import { RealtimeSession } from "@openai/agents/realtime";
import { useRef, useState } from "react";
import { nuboAgent } from "@/lib/nubo-agent";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

export function NuboVoiceConsole() {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");

  const connect = async () => {
    setError("");
    setState("connecting");

    try {
      const tokenResponse = await fetch("/api/realtime-token", { cache: "no-store" });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData.value) {
        throw new Error(tokenData.error ?? "無法取得即時語音憑證");
      }

      const session = new RealtimeSession(nuboAgent, {
        model: "gpt-realtime-2",
        transport: "webrtc",
        config: {
          audio: {
            output: { voice: "marin" },
          },
        },
      });

      session.on("error", (event) => {
        console.error(event);
        setError("語音連線發生錯誤，請重新連線。");
        setState("error");
      });

      await session.connect({ apiKey: tokenData.value });
      sessionRef.current = session;
      setState("connected");
    } catch (cause) {
      console.error(cause);
      setError(cause instanceof Error ? cause.message : "語音連線失敗");
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
    idle: ["NUBO 待命", "按下啟動後允許麥克風權限"],
    connecting: ["正在建立安全連線", "請稍候"],
    connected: ["NUBO 正在聆聽", "直接說出你的需求"],
    error: ["連線未完成", "請檢查 API Key 與麥克風權限"],
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
        <div className="capability">
          <b>即時語音</b>
          <small>低延遲繁體中文對話與自然打斷。</small>
        </div>
        <div className="capability">
          <b>任務草稿</b>
          <small>可把每日或每小時追蹤需求轉成結構化草稿。</small>
        </div>
        <div className="capability">
          <b>安全權限</b>
          <small>寄信、付款、刪除、改價等操作預設禁止自動執行。</small>
        </div>
      </div>
    </section>
  );
}
