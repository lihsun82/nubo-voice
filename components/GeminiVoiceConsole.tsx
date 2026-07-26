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

type ConnectionState = "idle" | "connecting" | "connected" | "fallback" | "error";
type GeminiTokenData = { token: string; model: string; expiresAt?: string; websocketUrl?: string; wsVersion?: string };

class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(payload.error ?? "NUBO工具執行失敗", response.status);
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

function isQuotaError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value ?? "");
  const status = value instanceof HttpError ? value.status : 0;
  return status === 429 || /quota|resource_exhausted|rate.?limit|額度|配額|too many requests/i.test(message);
}

function isWakePhrase(text: string) {
  const value = text.replace(/\s+/g, "").toLowerCase();
  return ["nubo", "hanubo", "heynubo", "嗨nubo", "兄弟", "有人嗎", "有人吗", "努寶", "哈努寶", "嘿努寶"].some(
    (phrase) => value === phrase || value.includes(phrase),
  );
}

function shouldAcknowledgeQuestion(text: string) {
  const normalized = text.trim();
  return Boolean(normalized) && /[?？嗎呢]|查|找|搜尋|幫我|怎麼|如何|為什麼|哪個|多少|是否|可以|解決|分析/.test(normalized);
}

export function GeminiVoiceConsole() {
  const socketRef = useRef<WebSocket | null>(null);
  const microphoneRef = useRef<MicrophonePcmStream | null>(null);
  const playbackRef = useRef<PcmPlaybackQueue | null>(null);
  const recognitionRef = useRef<any>(null);
  const closingRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const sessionHandleRef = useRef<string | null>(null);
  const tokenDataRef = useRef<GeminiTokenData | null>(null);
  const setupCompleteRef = useRef(false);
  const lastUserTextRef = useRef("");
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("本機喚醒待命，不使用 Gemini Token。");

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  };

  const clearIdleTimer = () => {
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  };

  const stopRecognition = () => {
    try { recognitionRef.current?.stop?.(); } catch {}
    recognitionRef.current = null;
  };

  const stopGeminiTransport = async () => {
    clearReconnectTimer();
    clearIdleTimer();
    socketRef.current?.close(1000, "NUBO sleep");
    socketRef.current = null;
    await microphoneRef.current?.stop();
    await playbackRef.current?.close();
    microphoneRef.current = null;
    playbackRef.current = null;
    sessionHandleRef.current = null;
    tokenDataRef.current = null;
    setupCompleteRef.current = false;
  };

  const sleepToLocalWake = async (message = "45秒未互動，NUBO已自動睡眠。本機喚醒待命。") => {
    closingRef.current = true;
    await stopGeminiTransport();
    setState("idle");
    setError("");
    setTranscript(message);
    closingRef.current = false;
  };

  const armIdleTimer = () => {
    clearIdleTimer();
    idleTimerRef.current = window.setTimeout(() => void sleepToLocalWake(), 45_000);
  };

  const speakFallback = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-TW";
    window.speechSynthesis.speak(utterance);
  };

  const askOmniRoute = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const command = await runLocalVoiceCommand(trimmed);
    if (command.handled && command.type === "standby") {
      stopRecognition();
      setState("idle");
      setTranscript("NUBO已退下。本機喚醒待命。");
      return;
    }
    setTranscript(`OmniRoute處理中：${trimmed}`);
    try {
      const result = await requestJson<{ text: string; model?: string }>("/api/omniroute/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      setTranscript(result.text);
      speakFallback(result.text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "OmniRoute備援失敗");
    }
  };

  const startRecognition = (mode: "wake" | "fallback") => {
    stopRecognition();
    const Recognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      if (mode === "wake") setTranscript("此瀏覽器不支援本機喚醒；可按「啟動NUBO」使用。待命期間不耗 Gemini Token。");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "zh-TW";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const result = event.results?.[event.results.length - 1];
      const text = result?.[0]?.transcript?.trim?.() ?? "";
      if (!text) return;
      if (mode === "wake") {
        if (isWakePhrase(text)) {
          stopRecognition();
          setTranscript(`已聽到喚醒詞「${text}」，正在連接 Gemini…`);
          void connect(false);
        }
      } else {
        void askOmniRoute(text);
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition && ((mode === "wake" && state === "idle") || (mode === "fallback" && state === "fallback"))) {
        window.setTimeout(() => { try { recognition.start(); } catch {} }, 500);
      }
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch {}
  };

  const activateOmniRouteFallback = async (reason: string) => {
    closingRef.current = true;
    await stopGeminiTransport();
    closingRef.current = false;
    setState("fallback");
    setError("");
    setTranscript(`${reason}。已停止 Gemini 重連並切換 OmniRoute，現在可直接說話。`);
  };

  const scheduleReconnect = (reason: string) => {
    if (closingRef.current || reconnectTimerRef.current) return;
    if (isQuotaError(reason)) {
      void activateOmniRouteFallback("Gemini 額度/速率限制已觸發");
      return;
    }
    const attempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempt;
    if (attempt > 2) {
      void activateOmniRouteFallback("Gemini 連線連續失敗2次");
      return;
    }
    const delayMs = attempt === 1 ? 1000 : 2500;
    setState("connecting");
    setTranscript(`${reason}，第${attempt}次重連…`);
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      void connect(true);
    }, delayMs);
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
    stopRecognition();
    clearReconnectTimer();
    clearIdleTimer();
    setError("");
    if (!isReconnect) {
      sessionHandleRef.current = null;
      tokenDataRef.current = null;
      reconnectAttemptsRef.current = 0;
    }
    setupCompleteRef.current = false;
    setState("connecting");
    closingRef.current = false;
    try {
      const tokenData = await getTokenForConnection(isReconnect);
      const endpoint = tokenData.websocketUrl ?? "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
      const socket = new WebSocket(`${endpoint}?access_token=${encodeURIComponent(tokenData.token)}`);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;
      playbackRef.current = new PcmPlaybackQueue();
      socket.onopen = () => {
        socket.send(JSON.stringify({ setup: {
          model: `models/${tokenData.model}`,
          generationConfig: { responseModalities: ["AUDIO"] },
          systemInstruction: { parts: [{ text: geminiSystemInstruction }] },
          tools: [{ functionDeclarations: geminiFunctionDeclarations }],
          inputAudioTranscription: {},
          contextWindowCompression: { slidingWindow: {} },
          sessionResumption: sessionHandleRef.current ? { handle: sessionHandleRef.current } : {},
        }}));
      };
      socket.onmessage = async (event) => {
        try {
          const message = await parseSocketMessage(event.data);
          const sessionUpdate = message.sessionResumptionUpdate ?? message.session_resumption_update;
          const newHandle = sessionUpdate?.newHandle ?? sessionUpdate?.new_handle;
          if (sessionUpdate?.resumable && typeof newHandle === "string") sessionHandleRef.current = newHandle;
          const goAway = message.goAway ?? message.go_away;
          if (goAway && !closingRef.current) {
            socket.close(1000, "Gemini GoAway reconnect");
            return;
          }
          if (message.setupComplete) {
            setupCompleteRef.current = true;
            reconnectAttemptsRef.current = 0;
            const microphone = new MicrophonePcmStream();
            microphoneRef.current = microphone;
            await microphone.start((data) => {
              if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ realtimeInput: { audio: { data, mimeType: "audio/pcm;rate=16000" } } }));
            });
            setState("connected");
            setTranscript("NUBO正在聆聽；45秒無互動會自動睡眠。");
            armIdleTimer();
          }
          const serverContent = message.serverContent;
          if (serverContent?.interrupted) playbackRef.current?.interrupt();
          const parts = serverContent?.modelTurn?.parts;
          if (Array.isArray(parts)) for (const part of parts) if (part?.inlineData?.data) await playbackRef.current?.enqueue(part.inlineData.data, 24000);
          const userText = serverContent?.inputTranscription?.text;
          const modelText = serverContent?.outputTranscription?.text;
          if (typeof userText === "string" && userText.trim()) {
            armIdleTimer();
            const trimmed = userText.trim();
            const command = await runLocalVoiceCommand(trimmed);
            if (command.handled && command.type === "standby") {
              await sleepToLocalWake("NUBO已退下。本機喚醒待命。");
              return;
            }
            if (shouldAcknowledgeQuestion(trimmed) && lastUserTextRef.current !== trimmed) {
              lastUserTextRef.current = trimmed;
              setTranscript(`正在處理：${trimmed}`);
            }
          }
          if (typeof modelText === "string" && modelText.trim()) {
            armIdleTimer();
            setTranscript(modelText.trim());
          }
          const calls = message.toolCall?.functionCalls;
          if (Array.isArray(calls) && calls.length > 0) {
            armIdleTimer();
            const functionResponses = [];
            for (const call of calls as FunctionCall[]) {
              try {
                if (call.name === "research_now") playTechSearchSound(1800);
                const result = await executeNuboBrowserTool(call);
                functionResponses.push({ id: call.id, name: call.name, response: { result } });
              } catch (cause) {
                functionResponses.push({ id: call.id, name: call.name, response: { error: cause instanceof Error ? cause.message : "工具執行失敗" } });
              }
            }
            socket.send(JSON.stringify({ toolResponse: { functionResponses } }));
          }
        } catch (cause) {
          socket.close(1011, cause instanceof Error ? cause.message.slice(0, 100) : "Gemini message handling failed");
        }
      };
      socket.onerror = () => setTranscript("Gemini Live連線異常，正在判斷是否切換備援…");
      socket.onclose = (event) => {
        void microphoneRef.current?.stop();
        void playbackRef.current?.close();
        microphoneRef.current = null;
        playbackRef.current = null;
        socketRef.current = null;
        clearIdleTimer();
        if (!closingRef.current) {
          const detail = `Gemini Live ${setupCompleteRef.current ? "通話中斷" : "啟動失敗"}（${event.code}${event.reason ? `：${event.reason}` : ""}）`;
          if (isQuotaError(event.reason) || event.code === 1008 && /quota|resource|limit/i.test(event.reason)) void activateOmniRouteFallback("Gemini 額度/速率限制已觸發");
          else scheduleReconnect(detail);
        }
      };
    } catch (cause) {
      if (isQuotaError(cause)) {
        await activateOmniRouteFallback("Gemini 額度/速率限制已觸發");
      } else if (isReconnect) {
        scheduleReconnect(cause instanceof Error ? cause.message : "Gemini啟動失敗");
      } else {
        setError(cause instanceof Error ? cause.message : "Gemini啟動失敗");
        setState("error");
      }
    }
  };

  useEffect(() => {
    if (state === "idle") {
      notifyNuboVoicePhase("idle");
      startRecognition("wake");
    } else if (state === "fallback") {
      notifyNuboVoicePhase("listening");
      startRecognition("fallback");
    } else if (state === "connecting") notifyNuboVoicePhase("connecting");
    else if (state === "connected") notifyNuboVoicePhase("listening");
    else notifyNuboVoicePhase("error");
    return () => stopRecognition();
  }, [state]);

  useEffect(() => () => {
    closingRef.current = true;
    stopRecognition();
    clearReconnectTimer();
    clearIdleTimer();
    socketRef.current?.close();
  }, []);

  const stateLabel = {
    idle: ["NUBO省額度待命", "本機喚醒監聽中，不使用 Gemini Token"],
    connecting: ["正在連接Gemini", "只有喚醒後才建立 Live 連線"],
    connected: ["NUBO正在聆聽", "45秒無互動自動睡眠"],
    fallback: ["OmniRoute備援中", "Gemini已停止耗用，可直接說話"],
    error: ["NUBO語音未連線", "可手動重試或檢查網路設定"],
  }[state];

  return (
    <section className="console" aria-live="polite">
      <div className="orb-wrap"><NuboEnergyOrb /></div>
      <div className="status"><strong>{stateLabel[0]}</strong><span>{stateLabel[1]}</span></div>
      <div className="actions">
        <button className="primary" onClick={() => void connect()} disabled={state === "connecting" || state === "connected"}>啟動NUBO</button>
        <button className="secondary" onClick={() => void sleepToLocalWake("NUBO已進入省額度待命。")}>進入待命</button>
      </div>
      {transcript ? <div className="voice-transcript">{transcript}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="capabilities">
        <div className="capability"><b>本機喚醒</b><small>嗨NUBO／ha nubo／nubo／兄弟／有人嗎。</small></div>
        <div className="capability"><b>45秒睡眠</b><small>無互動即關閉 Gemini Live，停止消耗。</small></div>
        <div className="capability"><b>Quota停損</b><small>429/額度錯誤不重連，直接切 OmniRoute。</small></div>
      </div>
    </section>
  );
}
