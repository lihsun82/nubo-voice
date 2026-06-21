"use client";

import {
  OpenAIRealtimeWebRTC,
  RealtimeSession,
} from "@openai/agents/realtime";
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
      const transport = new OpenAIRealtimeWebRTC({
        baseUrl: `${window.location.origin}/api/realtime-call`,
        useInsecureApiKey: true,
      });

      const session = new RealtimeSession(nuboAgent, {
        model: "gpt-realtime-2",
        transport,
        config: {
          audio: {
            output: { voice: "marin" },
          },
        },
      });

      session.on("error", (event) => {
        console.error("NUBO realtime session error", event);
        setError(
          "語音連線失敗。請查看執行 npm.cmd run dev 的 PowerShell 視窗，取得真正的 OpenAI 錯誤原因。",
        );
        setState("error");
      });

      // 真正的 OpenAI API Key 僅存在 Next.js 伺服器。
      // 這個佔位字串只會送到本機 /api/realtime-call，
      // useInsecureApiKey 僅用來略過 SDK 對 ephemeral key 格式的前端檢查。
      await session.connect({ apiKey: "nubo-server-proxy" });
      sessionRef.current = session;
      setState("connected");
    } catch (cause) {
      console.error("NUBO connection failed", cause);
      setError(
        "無法完成 WebRTC 連線。請查看 PowerShell 是否出現 OpenAI Realtime call failed。",
      );
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
    error: ["連線未完成", "請查看 PowerShell 內的 OpenAI 錯誤訊息"],
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
        <button
          className="primary"
          onClick={connect}
          disabled={state === "connecting" || state === "connected"}
        >
          {state === "connecting" ? "連線中…" : "啟動 NUBO"}
        </button>
        <button
          className="secondary"
          onClick={disconnect}
          disabled={state !== "connected"}
        >
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
