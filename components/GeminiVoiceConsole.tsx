"use client";

import { useEffect, useRef, useState } from "react";
import { MicrophonePcmStream, PcmPlaybackQueue } from "@/lib/browser-audio";
import {
  executeNuboBrowserTool,
  geminiFunctionDeclarations,
  geminiSystemInstruction,
  type FunctionCall,
} from "@/lib/browser-nubo-tools";
import { runLocalVoiceCommand } from "@/lib/local-voice-commands";
import { notifyNuboVoicePhase } from "@/lib/nubo-voice-phase";
import { NuboEnergyOrb } from "@/components/NuboEnergyOrb";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "NUBO工具執行失敗");
  return payload;
}

async function parseSocketMessage(data: unknown) {
  let text: string;
  if (typeof data === "string") text = data;
  else if (data instanceof Blob) text = await data.text();
  else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
  else if (ArrayBuffer.isView(data)) text = new TextDecoder().decode(data);
  else throw new Error(`不支援的WebSocket訊息格式：${Object.prototype.toString.call(data)}`);
  return JSON.parse(text);
}

export function GeminiVoiceConsole() {
  const socketRef = useRef<WebSocket | null>(null);
  const microphoneRef = useRef<MicrophonePcmStream | null>(null);
  const playbackRef = useRef<PcmPlaybackQueue | null>(null);
  const closingRef = useRef(false);
  const phaseTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    if (state === "idle") notifyNuboVoicePhase("idle");
    else if (state === "connecting") notifyNuboVoicePhase("connecting");
    else if (state === "connected") notifyNuboVoicePhase("listening");
    else notifyNuboVoicePhase("error");
  }, [state]);

  const markSpeaking = () => {
    notifyNuboVoicePhase("speaking");
    if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
    phaseTimerRef.current = window.setTimeout(() => {
      notifyNuboVoicePhase("listening");
    }, 1500);
  };

  const disconnect = async () => {
    closingRef.current = true;
    socketRef.current?.close();
    socketRef.current = null;
    await microphoneRef.current?.stop();
    await playbackRef.current?.close();
    microphoneRef.current = null;
    playbackRef.current = null;
    setState("idle");
    setError("");
  };

  const connect = async () => {
    setError("");
    setTranscript("");
    setState("connecting");
    closingRef.current = false;

    try {
      const tokenData = await requestJson("/api/gemini-token", { cache: "no-store" });
      const endpoint =
        "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";
      const socket = new WebSocket(`${endpoint}?access_token=${encodeURIComponent(tokenData.token)}`);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      playbackRef.current = new PcmPlaybackQueue();

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            setup: {
              model: `models/${tokenData.model}`,
              generationConfig: { responseModalities: ["AUDIO"] },
              systemInstruction: { parts: [{ text: geminiSystemInstruction }] },
              tools: [{ functionDeclarations: geminiFunctionDeclarations }],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          }),
        );
      };

      socket.onmessage = async (event) => {
        try {
          const message = await parseSocketMessage(event.data);
          if (message.setupComplete) {
            const microphone = new MicrophonePcmStream();
            microphoneRef.current = microphone;
            await microphone.start((data) => {
              if (socket.readyState !== WebSocket.OPEN) return;
              socket.send(
                JSON.stringify({
                  realtimeInput: {
                    audio: { data, mimeType: "audio/pcm;rate=16000" },
                  },
                }),
              );
            });
            setState("connected");
          }

          const serverContent = message.serverContent;
          if (serverContent?.interrupted) {
            playbackRef.current?.interrupt();
            notifyNuboVoicePhase("listening");
          }
          const parts = serverContent?.modelTurn?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (part?.inlineData?.data) {
                markSpeaking();
                await playbackRef.current?.enqueue(part.inlineData.data, 24000);
              }
            }
          }

          const userText = serverContent?.inputTranscription?.text;
          const modelText = serverContent?.outputTranscription?.text;
          if (typeof modelText === "string" && modelText.trim()) {
            setTranscript(modelText.trim());
          } else if (typeof userText === "string" && userText.trim()) {
            notifyNuboVoicePhase("thinking");
            setTranscript(`你：${userText.trim()}`);
            void runLocalVoiceCommand(userText.trim())
              .then((command) => {
                if (command.handled) {
                  setTranscript(`已執行本機音量指令：${userText.trim()}`);
                }
              })
              .catch((cause) => {
                setError(cause instanceof Error ? cause.message : "本機音量指令失敗");
              });
          }

          const calls = message.toolCall?.functionCalls;
          if (Array.isArray(calls) && calls.length > 0) {
            notifyNuboVoicePhase("thinking");
            const functionResponses = [];
            for (const call of calls as FunctionCall[]) {
              try {
                const result = await executeNuboBrowserTool(call);
                functionResponses.push({
                  id: call.id,
                  name: call.name,
                  response: { result },
                });
              } catch (cause) {
                functionResponses.push({
                  id: call.id,
                  name: call.name,
                  response: {
                    error: cause instanceof Error ? cause.message : "工具執行失敗",
                  },
                });
              }
            }
            socket.send(JSON.stringify({ toolResponse: { functionResponses } }));
          }
        } catch (cause) {
          console.error("Gemini Live message decode failed", cause, event.data);
          setError("Gemini Live訊息或工具處理失敗，請查看PowerShell與瀏覽器主控台。");
          setState("error");
          socket.close();
        }
      };

      socket.onerror = () => {
        setError("Gemini Live連線發生錯誤，可切換回OpenAI語音。");
        setState("error");
      };

      socket.onclose = () => {
        void microphoneRef.current?.stop();
        microphoneRef.current = null;
        if (!closingRef.current) {
          setError("Gemini Live連線已中斷，請重新啟動。");
          setState("error");
        }
      };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gemini Live啟動失敗");
      setState("error");
    }
  };

  const stateLabel = {
    idle: ["NUBO待命", "920粒子科技球與Gemini Live語音"],
    connecting: ["正在連接Gemini", "能量核心正在增強"],
    connected: ["NUBO正在聆聽", "應用程式與音量控制已啟用"],
    error: ["Gemini語音未連線", "球體已切換為錯誤狀態"],
  }[state];

  return (
    <section className="console" aria-live="polite">
      <div className="orb-wrap">
        <NuboEnergyOrb />
      </div>
      <div className="status">
        <strong>{stateLabel[0]}</strong>
        <span>{stateLabel[1]}</span>
      </div>
      <div className="actions">
        <button className="primary" onClick={connect} disabled={state === "connecting" || state === "connected"}>
          {state === "connecting" ? "連線中…" : "啟動NUBO"}
        </button>
        <button className="secondary" onClick={() => void disconnect()} disabled={state === "idle"}>
          結束對話
        </button>
      </div>
      {transcript ? <div className="voice-transcript">{transcript}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="capabilities">
        <div className="capability"><b>應用程式控制</b><small>開啟LINE與固定白名單Windows應用程式。</small></div>
        <div className="capability"><b>音量控制</b><small>語音設定、增加、降低、靜音與解除靜音。</small></div>
        <div className="capability"><b>研究與工作流</b><small>研究、郵件、任務與自動化。</small></div>
      </div>
    </section>
  );
}
