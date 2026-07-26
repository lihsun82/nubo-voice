"use client";

import { useEffect, useRef, useState } from "react";
import { MicrophonePcmStream, PcmPlaybackQueue } from "@/lib/browser-audio";
import {
  executeNuboBrowserTool,
  geminiFunctionDeclarations,
  geminiSystemInstruction,
  type FunctionCall,
} from "@/lib/browser-nubo-tools-line";
import { runLocalVoiceCommand } from "@/lib/local-voice-commands";
import { notifyNuboVoicePhase } from "@/lib/nubo-voice-phase";
import { playTechSearchSound, speakNuboNotice } from "@/lib/nubo-feedback-audio";
import { NuboEnergyOrb } from "@/components/NuboEnergyOrb";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

type GeminiTokenData = {
  token: string;
  model: string;
  expiresAt?: string;
  websocketUrl?: string;
  wsVersion?: string;
};

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "NUBO工具執行失敗");
  return payload as T;
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

function shouldAcknowledgeQuestion(text: string) {
  const normalized = text.trim();
  if (!normalized) return false;
  return /[?？嗎呢]|查|找|搜尋|幫我|怎麼|如何|為什麼|哪個|多少|是否|可以|解決|分析/.test(normalized);
}

export function GeminiVoiceConsole() {
  const socketRef = useRef<WebSocket | null>(null);
  const microphoneRef = useRef<MicrophonePcmStream | null>(null);
  const playbackRef = useRef<PcmPlaybackQueue | null>(null);
  const closingRef = useRef(false);
  const phaseTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const sessionHandleRef = useRef<string | null>(null);
  const tokenDataRef = useRef<GeminiTokenData | null>(null);
  const setupCompleteRef = useRef(false);
  const lastUserTextRef = useRef("");
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    if (state === "idle") notifyNuboVoicePhase("idle");
    else if (state === "connecting") notifyNuboVoicePhase("connecting");
    else if (state === "connected") notifyNuboVoicePhase("listening");
    else notifyNuboVoicePhase("error");
  }, [state]);

  const clearReconnectTimer = () => {
    if (!reconnectTimerRef.current) return;
    window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  };

  const markSpeaking = () => {
    notifyNuboVoicePhase("speaking");
    if (phaseTimerRef.current) window.clearTimeout(phaseTimerRef.current);
    phaseTimerRef.current = window.setTimeout(() => {
      notifyNuboVoicePhase("listening");
    }, 1500);
  };

  const acknowledgeQuestion = (text: string) => {
    const trimmed = text.trim();
    if (!shouldAcknowledgeQuestion(trimmed)) return;
    if (lastUserTextRef.current === trimmed) return;
    lastUserTextRef.current = trimmed;
    speakNuboNotice("請稍等！");
    setTranscript(`請稍等！我正在處理：${trimmed}`);
  };

  const scheduleReconnect = (reason = "Gemini Live連線已中斷") => {
    if (closingRef.current || reconnectTimerRef.current) return;
    const attempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempt;

    if (attempt > 5) {
      setError(`${reason}，已嘗試自動重連5次仍失敗。請重新啟動NUBO或檢查網路/API額度。`);
      setState("error");
      return;
    }

    const delayMs = Math.min(8000, 1000 * 2 ** Math.max(0, attempt - 1));
    setError("");
    setState("connecting");
    setTranscript(`${reason}，NUBO正在自動續接，第${attempt}次重連…`);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void connect(true);
    }, delayMs);
  };

  const disconnect = async () => {
    closingRef.current = true;
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;
    sessionHandleRef.current = null;
    tokenDataRef.current = null;
    setupCompleteRef.current = false;
    socketRef.current?.close();
    socketRef.current = null;
    await microphoneRef.current?.stop();
    await playbackRef.current?.close();
    microphoneRef.current = null;
    playbackRef.current = null;
    setState("idle");
    setError("");
  };

  const getTokenForConnection = async (isReconnect: boolean) => {
    const cached = tokenDataRef.current;
    const expiresAtMs = cached?.expiresAt ? Date.parse(cached.expiresAt) : Number.NaN;
    const cachedStillValid = cached && (!Number.isFinite(expiresAtMs) || expiresAtMs > Date.now() + 30_000);

    if (isReconnect && sessionHandleRef.current && cachedStillValid) return cached;

    if (isReconnect) sessionHandleRef.current = null;
    const fresh = await requestJson<GeminiTokenData>("/api/gemini-token", { cache: "no-store" });
    tokenDataRef.current = fresh;
    return fresh;
  };

  const connect = async (isReconnect = false) => {
    clearReconnectTimer();
    setError("");
    if (!isReconnect) {
      sessionHandleRef.current = null;
      tokenDataRef.current = null;
      reconnectAttemptsRef.current = 0;
      setTranscript("");
    }
    setupCompleteRef.current = false;
    setState("connecting");
    closingRef.current = false;

    try {
      const tokenData = await getTokenForConnection(isReconnect);
      const endpoint =
        tokenData.websocketUrl ??
        "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
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
              contextWindowCompression: { slidingWindow: {} },
              sessionResumption: sessionHandleRef.current ? { handle: sessionHandleRef.current } : {},
            },
          }),
        );
      };

      socket.onmessage = async (event) => {
        try {
          const message = await parseSocketMessage(event.data);

          const sessionUpdate = message.sessionResumptionUpdate ?? message.session_resumption_update;
          const newHandle = sessionUpdate?.newHandle ?? sessionUpdate?.new_handle;
          if (sessionUpdate?.resumable && typeof newHandle === "string") {
            sessionHandleRef.current = newHandle;
          }

          const goAway = message.goAway ?? message.go_away;
          if (goAway && !closingRef.current) {
            const timeLeft = goAway?.timeLeft ?? goAway?.time_left;
            setTranscript(`Gemini即將更新連線${timeLeft ? `（剩餘 ${timeLeft}）` : ""}，NUBO正在無縫續接…`);
            socket.close(1000, "Gemini GoAway reconnect");
            return;
          }

          if (message.setupComplete) {
            setupCompleteRef.current = true;
            reconnectAttemptsRef.current = 0;
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
            const trimmedUserText = userText.trim();
            const command = await runLocalVoiceCommand(trimmedUserText);
            if (command.handled) {
              if (command.type === "standby") {
                playbackRef.current?.interrupt();
                if ("speechSynthesis" in window) window.speechSynthesis.cancel();
                await disconnect();
                setTranscript("NUBO已退下，停止收音與播放。再次使用請按啟動NUBO。");
                return;
              }
              setTranscript(`已執行本機指令：${trimmedUserText}`);
              return;
            }

            notifyNuboVoicePhase("thinking");
            acknowledgeQuestion(trimmedUserText);
            setTranscript((current) => current || `你：${trimmedUserText}`);
          }

          const calls = message.toolCall?.functionCalls;
          if (Array.isArray(calls) && calls.length > 0) {
            notifyNuboVoicePhase("thinking");
            const functionResponses = [];
            for (const call of calls as FunctionCall[]) {
              try {
                if (call.name === "research_now") {
                  speakNuboNotice("請稍等！");
                  playTechSearchSound(2400);
                }
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
          setError("Gemini Live訊息或工具處理失敗，NUBO將嘗試自動重連。");
          socket.close(1011, "Gemini message handling failed");
        }
      };

      socket.onerror = () => {
        setTranscript("Gemini Live連線異常，NUBO準備自動重連…");
      };

      socket.onclose = (event) => {
        void microphoneRef.current?.stop();
        void playbackRef.current?.close();
        microphoneRef.current = null;
        playbackRef.current = null;
        socketRef.current = null;
        if (!closingRef.current) {
          const closeDetail = `代碼 ${event.code}${event.reason ? `：${event.reason}` : ""}`;
          const phase = setupCompleteRef.current ? "通話中斷" : "啟動階段失敗";
          scheduleReconnect(`Gemini Live ${phase}（${closeDetail}）`);
        }
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Gemini Live啟動失敗";
      if (isReconnect && !closingRef.current) {
        scheduleReconnect(message);
      } else {
        setError(message);
        setState("error");
      }
    }
  };

  const stateLabel = {
    idle: ["NUBO待命", "920粒子科技球與Gemini Live語音"],
    connecting: ["正在連接Gemini", "能量核心正在增強"],
    connected: ["NUBO正在聆聽", "應用程式、網頁、Gmail與搜尋音效已啟用"],
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
        <button className="primary" onClick={() => void connect()} disabled={state === "connecting" || state === "connected"}>
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
        <div className="capability"><b>NUBO喚醒</b><small>呼叫nubo時會把NUBO網頁帶回桌面。</small></div>
        <div className="capability"><b>研究與Gmail</b><small>查找資料有請稍等提示與科技搜尋音效。</small></div>
      </div>
    </section>
  );
}
