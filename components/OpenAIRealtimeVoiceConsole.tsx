"use client";

import { useEffect, useRef, useState } from "react";
import { NuboEnergyOrb } from "@/components/NuboEnergyOrb";
import {
  NuboQuestionHistory,
  recordNuboQuestion,
} from "@/components/NuboQuestionHistory";
import {
  executeNuboBrowserTool,
  geminiFunctionDeclarations,
  geminiSystemInstruction,
  type FunctionCall,
} from "@/lib/browser-nubo-tools-line";
import { runLocalVoiceCommand } from "@/lib/local-voice-commands";
import { sendTranscriptToNameAlert } from "@/lib/nubo-name-alert-client";
import { NuboRealtimeEcoGate, type NuboEcoMode } from "@/lib/nubo-realtime-eco";
import { notifyNuboVoicePhase } from "@/lib/nubo-voice-phase";
import {
  getNuboPersonalityInstruction,
  type NuboVoiceProfile,
} from "@/lib/nubo-voice-profile";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  item_id?: string;
  error?: { message?: string };
  response?: { status?: string };
};

type SinkAudioElement = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

function extractClientSecret(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as {
    value?: unknown;
    client_secret?: { value?: unknown };
    clientSecret?: { value?: unknown };
  };

  const candidate =
    value.value ?? value.client_secret?.value ?? value.clientSecret?.value;
  return typeof candidate === "string" ? candidate : "";
}

function toRealtimeTools() {
  return geminiFunctionDeclarations.map((declaration) => ({
    type: "function",
    name: declaration.name,
    description: declaration.description,
    parameters: declaration.parameters,
  }));
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ error: "工具結果無法序列化" });
  }
}

function removeStaleNuboAudioOutputs() {
  document
    .querySelectorAll<HTMLAudioElement>('audio[data-nubo-voice-output="true"]')
    .forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    });
}

export function OpenAIRealtimeVoiceConsole({
  profile,
}: {
  profile: NuboVoiceProfile;
}) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ecoGateRef = useRef<NuboRealtimeEcoGate | null>(null);
  const transcriptBufferRef = useRef("");
  const closingRef = useRef(false);
  const connectGuardRef = useRef(false);
  const connectionEpochRef = useRef(0);
  const [state, setState] = useState<ConnectionState>("idle");
  const [ecoMode, setEcoMode] = useState<NuboEcoMode>("active");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (state === "idle") notifyNuboVoicePhase("idle");
    else if (state === "connecting") notifyNuboVoicePhase("connecting");
    else if (state === "connected") notifyNuboVoicePhase("listening");
    else notifyNuboVoicePhase("error");
  }, [state]);

  const noteEcoActivity = () => {
    ecoGateRef.current?.noteActivity();
  };

  const sendEvent = (event: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (channel?.readyState !== "open") return false;
    channel.send(JSON.stringify(event));
    return true;
  };

  const disconnect = async () => {
    connectionEpochRef.current += 1;
    connectGuardRef.current = false;
    closingRef.current = true;
    sendEvent({ type: "response.cancel" });
    channelRef.current?.close();
    peerRef.current?.close();
    await ecoGateRef.current?.destroy();
    ecoGateRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
    }
    removeStaleNuboAudioOutputs();
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    audioRef.current = null;
    transcriptBufferRef.current = "";
    setEcoMode("active");
    setState("idle");
    setError("");
    notifyNuboVoicePhase("idle");
  };

  useEffect(() => {
    return () => {
      void disconnect();
    };
    // The component is intentionally remounted when the selected profile changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFunctionCall = async (event: RealtimeEvent) => {
    if (!event.name) return;

    noteEcoActivity();

    let args: Record<string, unknown> = {};
    try {
      args = event.arguments ? JSON.parse(event.arguments) : {};
    } catch {
      args = {};
    }

    const callId = event.call_id ?? event.item_id ?? crypto.randomUUID();

    try {
      notifyNuboVoicePhase("thinking");
      const result = await executeNuboBrowserTool({
        id: callId,
        name: event.name,
        args,
      } as FunctionCall);

      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: safeJson(result),
        },
      });
    } catch (cause) {
      sendEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: safeJson({
            error:
              cause instanceof Error ? cause.message : "NUBO工具執行失敗",
          }),
        },
      });
    }

    sendEvent({ type: "response.create" });
  };

  const handleRealtimeEvent = (event: RealtimeEvent) => {
    const type = event.type ?? "";

    if (type === "session.created" || type === "session.updated") {
      noteEcoActivity();
      setState("connected");
      setError("");
      notifyNuboVoicePhase("listening");
      return;
    }

    if (type === "input_audio_buffer.speech_started") {
      noteEcoActivity();
      notifyNuboVoicePhase("listening");
      return;
    }

    if (
      type === "conversation.item.input_audio_transcription.completed" &&
      event.transcript?.trim()
    ) {
      noteEcoActivity();
      const text = event.transcript.trim();
      recordNuboQuestion(text);
      setTranscript(`你：${text}`);
      void sendTranscriptToNameAlert(text);
      void runLocalVoiceCommand(text).catch(() => {
        // Realtime conversation continues even if a local shortcut fails.
      });
      return;
    }

    if (
      type === "response.output_audio_transcript.delta" ||
      type === "response.audio_transcript.delta"
    ) {
      noteEcoActivity();
      transcriptBufferRef.current += event.delta ?? "";
      if (transcriptBufferRef.current.trim()) {
        setTranscript(transcriptBufferRef.current.trim());
      }
      notifyNuboVoicePhase("speaking");
      return;
    }

    if (
      type === "response.output_audio_transcript.done" ||
      type === "response.audio_transcript.done"
    ) {
      noteEcoActivity();
      const finalText =
        event.transcript?.trim() || transcriptBufferRef.current.trim();
      if (finalText) setTranscript(finalText);
      transcriptBufferRef.current = "";
      return;
    }

    if (
      type === "response.output_audio.delta" ||
      type === "response.audio.delta" ||
      type === "response.created"
    ) {
      noteEcoActivity();
      notifyNuboVoicePhase("speaking");
      return;
    }

    if (type === "response.function_call_arguments.done") {
      noteEcoActivity();
      void handleFunctionCall(event);
      return;
    }

    if (type === "response.done") {
      noteEcoActivity();
      transcriptBufferRef.current = "";
      notifyNuboVoicePhase("listening");
      if (event.response?.status === "failed") {
        setError("語音回覆失敗，請再說一次。");
      }
      return;
    }

    if (type === "error") {
      setError(event.error?.message ?? "即時語音發生錯誤");
      setState("error");
    }
  };

  const connect = async () => {
    if (
      connectGuardRef.current ||
      state === "connecting" ||
      state === "connected"
    ) {
      return;
    }

    connectGuardRef.current = true;
    const epoch = connectionEpochRef.current + 1;
    connectionEpochRef.current = epoch;
    closingRef.current = false;
    removeStaleNuboAudioOutputs();
    setEcoMode("active");
    setState("connecting");
    setError("");
    setTranscript("");

    try {
      const tokenResponse = await fetch(
        `/api/realtime-token?voice=${encodeURIComponent(profile.voice)}`,
        { cache: "no-store" },
      );
      const tokenPayload = await tokenResponse.json();
      if (!tokenResponse.ok) {
        throw new Error(tokenPayload.error ?? "即時語音憑證建立失敗");
      }
      if (connectionEpochRef.current !== epoch) return;

      const clientSecret = extractClientSecret(tokenPayload);
      if (!clientSecret) throw new Error("即時語音憑證格式不正確");

      const peer = new RTCPeerConnection();
      peerRef.current = peer;

      const remoteAudio = document.createElement("audio") as SinkAudioElement;
      remoteAudio.autoplay = true;
      remoteAudio.dataset.nuboVoiceOutput = "true";
      remoteAudio.setAttribute("playsinline", "true");
      remoteAudio.style.display = "none";
      document.body.appendChild(remoteAudio);
      audioRef.current = remoteAudio;

      peer.ontrack = (event) => {
        if (
          closingRef.current ||
          connectionEpochRef.current !== epoch ||
          audioRef.current !== remoteAudio
        ) {
          return;
        }
        remoteAudio.srcObject = event.streams[0];
        void remoteAudio.setSinkId?.("id-multimedia").catch(() => undefined);
        void remoteAudio.play().catch(() => undefined);
      };

      peer.onconnectionstatechange = () => {
        if (closingRef.current || connectionEpochRef.current !== epoch) return;
        if (peer.connectionState === "connected") {
          connectGuardRef.current = false;
          setState("connected");
          setError("");
        } else if (
          peer.connectionState === "failed" ||
          peer.connectionState === "disconnected"
        ) {
          connectGuardRef.current = false;
          setState("error");
          setError("即時語音連線中斷，請重新啟動 NUBO。");
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      if (connectionEpochRef.current !== epoch) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.getAudioTracks().forEach((track) => {
        track.contentHint = "speech";
      });
      streamRef.current = stream;

      const ecoGate = new NuboRealtimeEcoGate((mode) => {
        setEcoMode(mode);
        if (mode === "sleeping") {
          notifyNuboVoicePhase("idle");
        } else if (!closingRef.current) {
          notifyNuboVoicePhase("listening");
        }
      });
      ecoGateRef.current = ecoGate;
      await ecoGate.attach(peer, stream);
      ecoGate.noteActivity();

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onmessage = (message) => {
        if (connectionEpochRef.current !== epoch) return;
        try {
          handleRealtimeEvent(JSON.parse(message.data));
        } catch {
          // Ignore unknown non-JSON data channel messages.
        }
      };
      channel.onerror = () => {
        if (connectionEpochRef.current !== epoch) return;
        setError("即時語音控制通道異常。");
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      const instructions = `${geminiSystemInstruction}\n\n${getNuboPersonalityInstruction(
        profile.personality,
      )}`;
      const session = {
        type: "realtime",
        model: "gpt-realtime-2",
        instructions,
        output_modalities: ["audio"],
        truncation: {
          type: "retention_ratio",
          retention_ratio: 0.75,
          token_limits: {
            post_instructions: 8000,
          },
        },
        audio: {
          input: {
            transcription: {
              model: "gpt-4o-mini-transcribe",
              language: "zh",
              prompt: "繁體中文、台灣用語、NUBO、旅館營運、Gmail、YouTube",
            },
            noise_reduction: { type: "near_field" },
            turn_detection: {
              type: "semantic_vad",
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            voice: profile.voice,
          },
        },
        tools: toRealtimeTools(),
        tool_choice: "auto",
      };

      const form = new FormData();
      form.append(
        "sdp",
        new Blob([offer.sdp ?? ""], { type: "application/sdp" }),
        "offer.sdp",
      );
      form.append(
        "session",
        new Blob([JSON.stringify(session)], { type: "application/json" }),
        "session.json",
      );

      const callResponse = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${clientSecret}` },
          body: form,
        },
      );
      const answerSdp = await callResponse.text();
      if (!callResponse.ok) {
        throw new Error(answerSdp || "即時語音 WebRTC 連線失敗");
      }
      if (connectionEpochRef.current !== epoch) return;

      await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });
      connectGuardRef.current = false;
    } catch (cause) {
      if (connectionEpochRef.current !== epoch) return;
      connectGuardRef.current = false;
      await disconnect();
      setState("error");
      setError(cause instanceof Error ? cause.message : "即時語音啟動失敗");
    }
  };

  const stateLabel =
    state === "connected" && ecoMode === "sleeping"
      ? ["NUBO智慧節約待命", "雲端收音已暫停・偵測到近端語音會自動恢復"]
      : {
          idle: ["NUBO待命", "智慧服務已就緒"],
          connecting: ["NUBO正在連線", "正在啟動高擬人語音服務"],
          connected: ["NUBO正在聆聽", "高擬人陪伴與工具服務已啟用"],
          error: ["NUBO尚未連線", "請檢查語音設定或服務額度"],
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
        <button
          className="primary"
          onClick={() => void connect()}
          disabled={state === "connecting" || state === "connected"}
        >
          {state === "connecting" ? "連線中…" : "啟動NUBO"}
        </button>
        <button
          className="secondary"
          onClick={() => void disconnect()}
          disabled={state === "idle"}
        >
          結束對話
        </button>
      </div>
      {transcript ? <div className="voice-transcript">{transcript}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <NuboQuestionHistory />
    </section>
  );
}
