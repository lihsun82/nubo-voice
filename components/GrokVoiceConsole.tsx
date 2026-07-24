"use client";

import { useRef, useState } from "react";
import { MicrophonePcmStream, PcmPlaybackQueue } from "@/lib/browser-audio";
import { notifyNuboVoicePhase } from "@/lib/nubo-voice-phase";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

type GrokTokenResponse = {
  token: string;
  expiresAt?: number;
  model: string;
  voice: string;
};

async function getToken(): Promise<GrokTokenResponse> {
  const response = await fetch("/api/grok-token", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "無法取得 Grok 語音 Token");
  return payload;
}

async function parseSocketMessage(data: unknown) {
  if (typeof data === "string") return JSON.parse(data);
  if (data instanceof Blob) return JSON.parse(await data.text());
  if (data instanceof ArrayBuffer) return JSON.parse(new TextDecoder().decode(data));
  throw new Error("不支援的 Grok WebSocket 訊息格式");
}

export function GrokVoiceConsole() {
  const socketRef = useRef<WebSocket | null>(null);
  const microphoneRef = useRef<MicrophonePcmStream | null>(null);
  const playbackRef = useRef<PcmPlaybackQueue | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");

  const disconnect = async () => {
    socketRef.current?.close(1000, "user disconnect");
    socketRef.current = null;
    await microphoneRef.current?.stop();
    await playbackRef.current?.close();
    microphoneRef.current = null;
    playbackRef.current = null;
    setState("idle");
    setError("");
    notifyNuboVoicePhase("idle");
  };

  const connect = async () => {
    setError("");
    setTranscript("");
    setState("connecting");
    notifyNuboVoicePhase("connecting");

    try {
      const tokenData = await getToken();
      const url = `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(tokenData.model)}`;
      const socket = new WebSocket(url, [`xai-client-secret.${tokenData.token}`]);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      playbackRef.current = new PcmPlaybackQueue();

      socket.onopen = () => {
        socket.send(JSON.stringify({
          type: "session.update",
          session: {
            voice: tokenData.voice,
            instructions: "你是 NUBO。請以繁體中文自然、簡潔地回覆使用者。除非使用者要求，避免冗長回答。",
            reasoning: { effort: "high" },
            turn_detection: { type: "server_vad" },
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 16000 },
                transcription: { model: "grok-transcribe", language_hint: "zh-TW" },
              },
              output: { format: { type: "audio/pcm", rate: 24000 } },
            },
          },
        }));
      };

      socket.onmessage = async (event) => {
        try {
          const message = await parseSocketMessage(event.data);

          if (message.type === "session.updated") {
            const microphone = new MicrophonePcmStream();
            microphoneRef.current = microphone;
            await microphone.start((audio) => {
              if (socket.readyState !== WebSocket.OPEN) return;
              socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio }));
            });
            setState("connected");
            notifyNuboVoicePhase("listening");
            return;
          }

          if (message.type === "input_audio_buffer.speech_started") {
            playbackRef.current?.interrupt();
            notifyNuboVoicePhase("listening");
            return;
          }

          if (message.type === "conversation.item.input_audio_transcription.updated" ||
              message.type === "conversation.item.input_audio_transcription.completed") {
            const text = message.transcript ?? message.text;
            if (typeof text === "string" && text.trim()) setTranscript(`你：${text.trim()}`);
            return;
          }

          if (message.type === "response.output_audio.delta") {
            if (typeof message.delta === "string") {
              notifyNuboVoicePhase("speaking");
              await playbackRef.current?.enqueue(message.delta, 24000);
            }
            return;
          }

          if (message.type === "response.output_audio_transcript.delta") {
            if (typeof message.delta === "string" && message.delta) {
              setTranscript((current) => {
                const existing = current.startsWith("NUBO：") ? current.slice(5) : "";
                return `NUBO：${existing}${message.delta}`;
              });
            }
            return;
          }

          if (message.type === "response.output_audio.done" || message.type === "response.done") {
            notifyNuboVoicePhase("listening");
            return;
          }

          if (message.type === "error") {
            throw new Error(message.error?.message ?? "Grok Voice API 發生錯誤");
          }
        } catch (cause) {
          console.error("Grok voice message error", cause);
          setError(cause instanceof Error ? cause.message : "Grok 語音訊息處理失敗");
          setState("error");
          notifyNuboVoicePhase("error");
        }
      };

      socket.onerror = () => {
        setError("Grok 語音連線失敗，請檢查 xAI API Key、額度與網路。");
        setState("error");
        notifyNuboVoicePhase("error");
      };

      socket.onclose = () => {
        if (state === "connected") setState("idle");
      };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Grok 語音連線失敗");
      setState("error");
      notifyNuboVoicePhase("error");
    }
  };

  const labels = {
    idle: ["NUBO 待命", "Grok Voice 尚未連線"],
    connecting: ["正在連接 Grok", "請允許麥克風權限"],
    connected: ["NUBO 正在聆聽", "Grok Voice 已連線"],
    error: ["Grok Voice 未連線", "請檢查 xAI API 設定"],
  }[state];

  return (
    <section className="console" aria-live="polite">
      <div className="orb-wrap"><div className={`orb ${state === "connected" ? "active" : ""}`} /></div>
      <div className="status"><strong>{labels[0]}</strong><span>{labels[1]}</span></div>
      <div className="actions">
        <button className="primary" onClick={connect} disabled={state === "connecting" || state === "connected"}>
          {state === "connecting" ? "連線中…" : "啟動 Grok NUBO"}
        </button>
        <button className="secondary" onClick={() => void disconnect()} disabled={state === "idle"}>結束對話</button>
      </div>
      {transcript ? <div className="transcript">{transcript}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="capabilities">
        <div className="capability"><b>Grok Voice</b><small>原生即時語音對話；目前僅測試語音，不啟用外部寫入工具。</small></div>
        <div className="capability"><b>安全 Token</b><small>手機只取得短效 Token，不暴露 XAI_API_KEY。</small></div>
      </div>
    </section>
  );
}
