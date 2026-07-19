"use client";

import { useEffect } from "react";

const GEMINI_LIVE_HOST =
  "generativelanguage.googleapis.com";

const HUMAN_DIALOG_INSTRUCTION = `
NUBO真人感對話模式：
- 使用自然的台灣繁體中文口吻，像熟悉、可靠的人在對話，不像客服、播報員或說明書。
- 先抓住使用者真正想表達的重點，再直接回應；不要複誦問題，也不要先講長篇前言。
- 一般對話先用一到三句回答，說到重點就停；只有使用者要求深入時才展開。
- 可以少量使用自然口語與短暫承接，例如「嗯，我懂」「對」「這樣看起來」，但不要每次都用，也不要刻意裝腔。
- 注意使用者語氣與情緒。對方開心、煩躁、疲倦或猶豫時，回應方式要跟著調整，不要只處理字面內容。
- 聽不清楚時只問一個最關鍵的澄清問題；不要一次丟出多個問題。
- 能直接回答就立刻開始說，不要沉默等待完整長文，也不要說「請稍等」「我正在思考」或「我正在處理」。
- 不要使用制式結尾，不要每次都問「還需要什麼嗎」。
- 保持誠實，不要假裝自己是人類，也不要主動強調自己是AI。
`;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tuneSetupMessage(raw: string) {
  let payload: JsonRecord;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return raw;
    payload = parsed;
  } catch {
    return raw;
  }

  const setup = payload.setup;
  if (!isRecord(setup)) return raw;

  const model = String(setup.model ?? "");
  const generationConfig = isRecord(setup.generationConfig)
    ? setup.generationConfig
    : {};
  const responseModalities = generationConfig.responseModalities;

  if (
    !model.includes("gemini-") ||
    !Array.isArray(responseModalities) ||
    !responseModalities.includes("AUDIO")
  ) {
    return raw;
  }

  const existingThinking = isRecord(generationConfig.thinkingConfig)
    ? generationConfig.thinkingConfig
    : {};
  const existingSpeech = isRecord(generationConfig.speechConfig)
    ? generationConfig.speechConfig
    : {};
  const existingVoiceConfig = isRecord(existingSpeech.voiceConfig)
    ? existingSpeech.voiceConfig
    : {};

  setup.generationConfig = {
    ...generationConfig,
    responseModalities: ["AUDIO"],
    thinkingConfig: {
      ...existingThinking,
      thinkingLevel: "minimal",
      includeThoughts: false,
    },
    speechConfig: {
      ...existingSpeech,
      voiceConfig: {
        ...existingVoiceConfig,
        prebuiltVoiceConfig: {
          voiceName: "Sulafat",
        },
      },
    },
  };

  const existingRealtime = isRecord(setup.realtimeInputConfig)
    ? setup.realtimeInputConfig
    : {};
  const existingDetection = isRecord(
    existingRealtime.automaticActivityDetection,
  )
    ? existingRealtime.automaticActivityDetection
    : {};

  setup.realtimeInputConfig = {
    ...existingRealtime,
    activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
    automaticActivityDetection: {
      ...existingDetection,
      disabled: false,
      startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
      prefixPaddingMs: 40,
      endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
      silenceDurationMs: 320,
    },
  };

  const existingInstruction = isRecord(setup.systemInstruction)
    ? setup.systemInstruction
    : {};
  const existingParts = Array.isArray(existingInstruction.parts)
    ? existingInstruction.parts
    : [];

  setup.systemInstruction = {
    ...existingInstruction,
    parts: [
      ...existingParts,
      { text: HUMAN_DIALOG_INSTRUCTION },
    ],
  };

  return JSON.stringify(payload);
}

export function NuboGeminiLiveTuner() {
  useEffect(() => {
    const originalSend = WebSocket.prototype.send;
    type SendPayload = Parameters<WebSocket["send"]>[0];

    const tunedSend = function (
      this: WebSocket,
      data: SendPayload,
    ) {
      const nextData =
        typeof data === "string" &&
        this.url.includes(GEMINI_LIVE_HOST)
          ? tuneSetupMessage(data)
          : data;

      return Reflect.apply(originalSend, this, [nextData]);
    } as WebSocket["send"];

    WebSocket.prototype.send = tunedSend;

    return () => {
      if (WebSocket.prototype.send === tunedSend) {
        WebSocket.prototype.send = originalSend;
      }
    };
  }, []);

  return null;
}
