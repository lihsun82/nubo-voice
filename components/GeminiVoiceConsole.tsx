"use client";

import { useRef, useState } from "react";
import { MicrophonePcmStream, PcmPlaybackQueue } from "@/lib/browser-audio";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

type FunctionCall = {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
};

const systemInstruction = `
你是 NUBO，Leo 的個人 AI 語音總管。一律使用自然、簡潔的繁體中文。
你可以建立提醒、報告、研究與每日簡報任務，也能列出、立即執行、暫停或恢復任務。
時區固定 Asia/Taipei。具體時間必須轉成含 +08:00 的 ISO 8601。
使用者說現在就做時，先建立任務，再立即執行。
寄信、公開發布、刪除、付款、改價、取消訂單及正式 PMS 操作不得自行完成。
`;

const functionDeclarations = [
  {
    name: "create_task",
    description: "建立提醒、報告、研究、條件追蹤或每日簡報任務。",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        kind: { type: "STRING", enum: ["reminder", "report", "research", "brief"] },
        instruction: { type: "STRING" },
        condition: { type: "STRING", nullable: true },
        scheduleType: { type: "STRING", enum: ["once", "hourly", "daily", "interval"] },
        firstRunAt: { type: "STRING", nullable: true },
        intervalMinutes: { type: "NUMBER", nullable: true },
      },
      required: ["title", "kind", "instruction", "scheduleType"],
    },
  },
  {
    name: "list_tasks",
    description: "列出目前所有任務與下一次執行時間。",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "task_action",
    description: "立即執行、暫停或恢復指定任務。",
    parameters: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        action: { type: "STRING", enum: ["run", "pause", "resume"] },
      },
      required: ["id", "action"],
    },
  },
];

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "NUBO 工具執行失敗");
  return payload;
}

async function executeTool(call: FunctionCall) {
  const name = call.name ?? "";
  const args = call.args ?? {};
  if (name === "list_tasks") return requestJson("/api/tasks", { cache: "no-store" });

  if (name === "task_action") {
    return requestJson("/api/tasks/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: args.id, action: args.action }),
    });
  }

  if (name === "create_task") {
    return requestJson("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: args.title,
        kind: args.kind,
        instruction: args.instruction,
        condition: args.condition || undefined,
        schedule: {
          type: args.scheduleType,
          runAt: args.firstRunAt || undefined,
          intervalMinutes: args.intervalMinutes || undefined,
          timezone: "Asia/Taipei",
        },
      }),
    });
  }

  throw new Error(`不支援的工具：${name}`);
}

export function GeminiVoiceConsole() {
  const socketRef = useRef<WebSocket | null>(null);
  const microphoneRef = useRef<MicrophonePcmStream | null>(null);
  const playbackRef = useRef<PcmPlaybackQueue | null>(null);
  const closingRef = useRef(false);
  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");

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
      socketRef.current = socket;
      playbackRef.current = new PcmPlaybackQueue();

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            setup: {
              model: `models/${tokenData.model}`,
              generationConfig: { responseModalities: ["AUDIO"] },
              systemInstruction: { parts: [{ text: systemInstruction }] },
              tools: [{ functionDeclarations }],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          }),
        );
      };

      socket.onmessage = async (event) => {
        const message = JSON.parse(String(event.data));
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
        if (serverContent?.interrupted) playbackRef.current?.interrupt();
        const parts = serverContent?.modelTurn?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (part?.inlineData?.data) {
              await playbackRef.current?.enqueue(part.inlineData.data, 24000);
            }
          }
        }
        const userText = serverContent?.inputTranscription?.text;
        const modelText = serverContent?.outputTranscription?.text;
        if (typeof modelText === "string" && modelText.trim()) setTranscript(modelText.trim());
        else if (typeof userText === "string" && userText.trim()) setTranscript(`你：${userText.trim()}`);

        const calls = message.toolCall?.functionCalls;
        if (Array.isArray(calls) && calls.length > 0) {
          const functionResponses = [];
          for (const call of calls as FunctionCall[]) {
            try {
              const result = await executeTool(call);
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
      };

      socket.onerror = () => {
        setError("Gemini Live 連線發生錯誤，將可切換回 OpenAI 語音。");
        setState("error");
      };

      socket.onclose = () => {
        void microphoneRef.current?.stop();
        microphoneRef.current = null;
        if (!closingRef.current) {
          setError("Gemini Live 連線已中斷，請重新啟動。");
          setState("error");
        }
      };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gemini Live 啟動失敗");
      setState("error");
    }
  };

  const stateLabel = {
    idle: ["NUBO 待命", "Gemini Live 優先語音"],
    connecting: ["正在連接 Gemini", "請允許麥克風權限"],
    connected: ["NUBO 正在聆聽", "Gemini Live 已連線"],
    error: ["Gemini 語音未連線", "可重新嘗試或切換 OpenAI"],
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
        <button className="secondary" onClick={() => void disconnect()} disabled={state === "idle"}>
          結束對話
        </button>
      </div>
      {transcript ? <div className="voice-transcript">{transcript}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="capabilities">
        <div className="capability"><b>Gemini Live</b><small>低延遲繁體中文語音與自然打斷。</small></div>
        <div className="capability"><b>多引擎任務</b><small>Gemini、Ollama、Groq與OpenAI自動備援。</small></div>
        <div className="capability"><b>安全權限</b><small>高風險外部操作仍需再次確認。</small></div>
      </div>
    </section>
  );
}
