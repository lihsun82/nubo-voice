"use client";

import { useEffect } from "react";
import { OpenAIRealtimeVoiceConsole } from "@/components/OpenAIRealtimeVoiceConsole";
import {
  NUBO_LANGUAGE_MODE_EVENT,
  buildNuboLanguageInstruction,
  readNuboLanguageMode,
  type NuboLanguageMode,
} from "@/lib/nubo-language-mode";
import { getNuboNoiseReductionType } from "@/lib/nubo-smart-noise";
import type { NuboVoiceProfile } from "@/lib/nubo-voice-profile";
import {
  NUBO_VOICE_TUNING_EVENT,
  buildNuboVoicePerformanceInstruction,
  readNuboVoiceTuning,
  type NuboVoiceTuning,
} from "@/lib/nubo-voice-tuning";

const OPENAI_REALTIME_CALL_URL = "https://api.openai.com/v1/realtime/calls";
const NUBO_REALTIME_PROXY_URL = "/api/realtime-token";
const NUBO_MIN_FLUID_SPEED = 1.04;
const NUBO_LOW_LATENCY_INSTRUCTION = `NUBO V20 低延遲流暢語音規則：
- 使用者說完後要快速接話，不要故意留長空白等待。
- 正文要連續、順暢地說完；不要在句子中間反覆停頓、切碎字詞或一字一頓。
- 除非真的需要思考，不要加入「嗯…」「欸…」「我想一下…」這類會拖慢回覆的前導語。
- 語助詞只在自然需要時使用，避免連續拖尾造成卡頓感。
- 一般問答先在第一句直接回答核心答案，再補充必要資訊。
- 數字、地址、日期與操作步驟仍需清楚，但不要因此刻意放慢整段語速。`;

let realtimeChannel: RTCDataChannel | null = null;
let realtimeBaseInstructions = "";

async function formValueToText(value: FormDataEntryValue | null) {
  if (typeof value === "string") return value;
  if (value instanceof Blob) return value.text();
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function fluidSpeed(tuning: NuboVoiceTuning) {
  return Math.max(NUBO_MIN_FLUID_SPEED, tuning.speed);
}

function buildInstructions(
  tuning: NuboVoiceTuning,
  languageMode = readNuboLanguageMode(),
) {
  return [
    realtimeBaseInstructions,
    buildNuboVoicePerformanceInstruction(tuning),
    buildNuboLanguageInstruction(languageMode),
    NUBO_LOW_LATENCY_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeSession(session: string) {
  if (!session.trim()) return "";

  try {
    const payload = JSON.parse(session) as Record<string, unknown>;
    const tuning = readNuboVoiceTuning();
    const audio = asRecord(payload.audio);
    const input = asRecord(audio.input);
    const output = asRecord(audio.output);
    const turnDetection = asRecord(input.turn_detection);

    output.speed = fluidSpeed(tuning);
    input.noise_reduction = {
      type: getNuboNoiseReductionType(),
    };
    input.turn_detection = {
      ...turnDetection,
      type: "semantic_vad",
      eagerness: "high",
      create_response: true,
      interrupt_response: true,
    };
    audio.input = input;
    audio.output = output;
    payload.audio = audio;

    realtimeBaseInstructions =
      typeof payload.instructions === "string" ? payload.instructions.trim() : "";
    payload.instructions = buildInstructions(tuning);
    payload.type = "realtime";
    payload.model = "gpt-realtime";
    return JSON.stringify(payload);
  } catch {
    throw new Error("高擬人語音設定格式不正確，請重新整理後再試。");
  }
}

function sendLiveSessionUpdate(
  tuning = readNuboVoiceTuning(),
  languageMode = readNuboLanguageMode(),
) {
  if (!realtimeChannel || realtimeChannel.readyState !== "open") return false;

  realtimeChannel.send(
    JSON.stringify({
      type: "session.update",
      session: {
        instructions: buildInstructions(tuning, languageMode),
        audio: {
          input: {
            noise_reduction: {
              type: getNuboNoiseReductionType(),
            },
            turn_detection: {
              type: "semantic_vad",
              eagerness: "high",
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            speed: fluidSpeed(tuning),
          },
        },
      },
    }),
  );
  return true;
}

function isHtmlResponse(contentType: string | null, body: string) {
  return Boolean(
    contentType?.includes("text/html") ||
      /^\s*<!doctype html/i.test(body) ||
      /^\s*<html/i.test(body),
  );
}

export function OpenAIRealtimeVoiceConsoleFixed({
  profile,
}: {
  profile: NuboVoiceProfile;
}) {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    const nativeCreateDataChannel = RTCPeerConnection.prototype.createDataChannel;
    let updateTimer: number | null = null;

    RTCPeerConnection.prototype.createDataChannel = function patchedCreateDataChannel(
      label: string,
      dataChannelDict?: RTCDataChannelInit,
    ) {
      const channel = Reflect.apply(nativeCreateDataChannel, this, [
        label,
        dataChannelDict,
      ]) as RTCDataChannel;
      if (label === "oai-events") realtimeChannel = channel;
      return channel;
    };

    const scheduleLiveUpdate = (
      tuning = readNuboVoiceTuning(),
      languageMode = readNuboLanguageMode(),
    ) => {
      if (updateTimer) window.clearTimeout(updateTimer);
      updateTimer = window.setTimeout(() => {
        updateTimer = null;
        sendLiveSessionUpdate(tuning, languageMode);
      }, 120);
    };

    const handleLiveTuning = (event: Event) => {
      const tuning =
        (event as CustomEvent<NuboVoiceTuning>).detail ?? readNuboVoiceTuning();
      scheduleLiveUpdate(tuning, readNuboLanguageMode());
    };

    const handleLanguageMode = (event: Event) => {
      const languageMode =
        (event as CustomEvent<NuboLanguageMode>).detail ?? readNuboLanguageMode();
      scheduleLiveUpdate(readNuboVoiceTuning(), languageMode);
    };

    const handleNoiseReady = () => {
      scheduleLiveUpdate(readNuboVoiceTuning(), readNuboLanguageMode());
    };

    window.addEventListener(NUBO_VOICE_TUNING_EVENT, handleLiveTuning);
    window.addEventListener(NUBO_LANGUAGE_MODE_EVENT, handleLanguageMode);
    window.addEventListener("nubo:smart-noise-ready", handleNoiseReady);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (
        url !== OPENAI_REALTIME_CALL_URL ||
        !(init?.body instanceof FormData)
      ) {
        return nativeFetch(input, init);
      }

      const originalForm = init.body;
      const sdp = await formValueToText(originalForm.get("sdp"));
      const normalizedSession = normalizeSession(
        await formValueToText(originalForm.get("session")),
      );

      if (!sdp.trim()) {
        throw new Error("OpenAI Realtime SDP 建立失敗，請重新啟動 NUBO。");
      }

      const proxyForm = new FormData();
      proxyForm.append("sdp", sdp);
      if (normalizedSession) proxyForm.append("session", normalizedSession);

      const response = await nativeFetch(NUBO_REALTIME_PROXY_URL, {
        method: "POST",
        body: proxyForm,
        cache: "no-store",
      });

      if (response.ok) return response;

      const body = await response.text();
      const contentType = response.headers.get("content-type");

      if (isHtmlResponse(contentType, body)) {
        throw new Error("高擬人語音路由尚未就緒，請重新整理後再啟動 NUBO。");
      }

      try {
        const payload = JSON.parse(body) as {
          error?: unknown;
          code?: unknown;
        };
        if (typeof payload.error === "string" && payload.error.trim()) {
          const code =
            typeof payload.code === "string" && payload.code.trim()
              ? `（${payload.code.trim()}）`
              : "";
          throw new Error(`${payload.error.trim()}${code}`);
        }
      } catch (cause) {
        if (
          cause instanceof Error &&
          cause.message !== "Unexpected end of JSON input"
        ) {
          throw cause;
        }
      }

      throw new Error("高擬人即時語音連線建立失敗，請稍後再試。");
    };

    return () => {
      if (updateTimer) window.clearTimeout(updateTimer);
      window.removeEventListener(NUBO_VOICE_TUNING_EVENT, handleLiveTuning);
      window.removeEventListener(NUBO_LANGUAGE_MODE_EVENT, handleLanguageMode);
      window.removeEventListener("nubo:smart-noise-ready", handleNoiseReady);
      RTCPeerConnection.prototype.createDataChannel = nativeCreateDataChannel;
      window.fetch = nativeFetch;
      realtimeChannel = null;
      realtimeBaseInstructions = "";
    };
  }, []);

  return <OpenAIRealtimeVoiceConsole profile={profile} />;
}
