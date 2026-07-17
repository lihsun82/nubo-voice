"use client";

import {
  OpenAIRealtimeWebRTC,
  RealtimeSession,
} from "@openai/agents/realtime";
import { useEffect, useRef, useState } from "react";
import { createNuboOpenAIAgent } from "@/lib/nubo-openai-agent";
import {
  getNuboPersonalityInstruction,
  openaiVoiceOptions,
  personalityOptions,
  readNuboVoiceProfile,
} from "@/lib/nubo-voice-profile";

type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "error";

export function OpenAIVoiceConsole() {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const [state, setState] =
    useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [activeLabel, setActiveLabel] = useState(
    "OpenAI高擬人語音",
  );

  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, []);

  const connect = async () => {
    setError("");
    setState("connecting");

    try {
      const profile = readNuboVoiceProfile();
      const voice = profile.openaiVoice;
      const personalityInstruction =
        getNuboPersonalityInstruction(
          profile.personality,
        );
      const voiceLabel =
        openaiVoiceOptions.find(
          (option) => option.id === voice,
        )?.label ?? voice;
      const personalityLabel =
        personalityOptions.find(
          (option) =>
            option.id === profile.personality,
        )?.label ?? profile.personality;

      setActiveLabel(
        `${voiceLabel}／${personalityLabel}`,
      );

      const transport = new OpenAIRealtimeWebRTC({
        baseUrl:
          `${window.location.origin}/api/realtime-call` +
          `?voice=${encodeURIComponent(voice)}`,
        useInsecureApiKey: true,
      });

      const agent = createNuboOpenAIAgent(
        personalityInstruction,
      );
      const session = new RealtimeSession(
        agent,
        {
          model: "gpt-realtime-2.1",
          transport,
          config: {
            outputModalities: ["audio"],
            reasoning: { effort: "low" },
            parallelToolCalls: false,
            audio: {
              output: { voice },
            },
          },
        } as any,
      );

      session.on("error", (event) => {
        console.error(
          "NUBO OpenAI voice session error",
          event,
        );
        setError(
          "OpenAI擬人語音連線失敗，請檢查API額度或切回Gemini。",
        );
        setState("error");
      });

      await session.connect({
        apiKey: "nubo-server-proxy",
      });
      sessionRef.current = session;
      setState("connected");
    } catch (cause) {
      console.error(
        "NUBO OpenAI voice connection failed",
        cause,
      );
      setError(
        cause instanceof Error
          ? cause.message
          : "OpenAI擬人語音連線失敗",
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
    idle: ["NUBO待命", activeLabel],
    connecting: [
      "NUBO正在連線",
      "正在啟動OpenAI擬人語音",
    ],
    connected: [
      "NUBO正在聆聽",
      activeLabel,
    ],
    error: [
      "NUBO尚未連線",
      "可切回Gemini Live繼續使用",
    ],
  }[state];

  return (
    <section className="console" aria-live="polite">
      <div className="orb-wrap">
        <div
          className={`orb ${
            state === "connected" ? "active" : ""
          }`}
        />
      </div>
      <div className="status">
        <strong>{stateLabel[0]}</strong>
        <span>{stateLabel[1]}</span>
      </div>
      <div className="actions">
        <button
          className="primary"
          onClick={connect}
          disabled={
            state === "connecting" ||
            state === "connected"
          }
        >
          {state === "connecting"
            ? "連線中…"
            : "啟動NUBO"}
        </button>
        <button
          className="secondary"
          onClick={disconnect}
          disabled={state !== "connected"}
        >
          結束對話
        </button>
      </div>
      {error ? (
        <div className="error">{error}</div>
      ) : null}
      <div className="capabilities">
        <div className="capability">
          <b>OpenAI擬人語音</b>
          <small>
            使用Marin、Cedar等自然聲線，支援情緒化表達。
          </small>
        </div>
        <div className="capability">
          <b>低延遲模式</b>
          <small>
            推理強度設定為low，一般問題優先直接回答。
          </small>
        </div>
        <div className="capability">
          <b>安全權限</b>
          <small>
            寄信與高風險操作仍保留再次確認。
          </small>
        </div>
      </div>
    </section>
  );
}
