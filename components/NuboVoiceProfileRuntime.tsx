"use client";

import { useEffect } from "react";
import {
  buildNuboLanguageInstruction,
  readNuboLanguageMode,
} from "@/lib/nubo-language-mode";
import {
  getNuboPersonalityInstruction,
  readNuboVoiceProfile,
} from "@/lib/nubo-voice-profile";
import {
  buildNuboVoicePerformanceInstruction,
  readNuboVoiceTuning,
} from "@/lib/nubo-voice-tuning";
import { hasNuboKioskLanguageInstruction } from "@/lib/nubo-native-language";

const PROFILE_MARKER = "NUBO_VOICE_PROFILE_V15";
const TUNING_MARKER = "NUBO_SHARED_VOICE_TUNING_V15_6_15";
const LANGUAGE_MARKER = "NUBO_TAIWAN_LANGUAGE_MODE_V15_6_21";

function configureGeminiSetupPayload(value: string) {
  let payload: unknown;

  try {
    payload = JSON.parse(value);
  } catch {
    return value;
  }

  if (!payload || typeof payload !== "object" || !("setup" in payload)) {
    return value;
  }

  const profile = readNuboVoiceProfile();
  if (profile.engine !== "gemini") return value;

  const root = payload as {
    setup?: {
      generationConfig?: Record<string, unknown>;
      systemInstruction?: {
        parts?: Array<{ text?: string }>;
      };
    };
  };
  const setup = root.setup;
  if (!setup) return value;

  setup.generationConfig = {
    ...(setup.generationConfig ?? {}),
    responseModalities: ["AUDIO"],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: profile.voice,
        },
      },
    },
  };

  const personality = getNuboPersonalityInstruction(profile.personality);
  const tuning = readNuboVoiceTuning();
  const performance = buildNuboVoicePerformanceInstruction(tuning);
  const parts = setup.systemInstruction?.parts;
  const includesKioskLanguage = Array.isArray(parts) && parts.some(({ text }) => hasNuboKioskLanguageInstruction(text ?? ""));
  const language = includesKioskLanguage ? "" : buildNuboLanguageInstruction(readNuboLanguageMode());
  const sharedInstruction = [
    `${PROFILE_MARKER}\n${personality}`,
    `${TUNING_MARKER}\n${performance}`,
    `${LANGUAGE_MARKER}\n${language}`.trim(),
  ].join("\n\n");

  if (Array.isArray(parts) && parts.length > 0) {
    const current = String(parts[0]?.text ?? "");
    if (!current.includes(LANGUAGE_MARKER)) {
      parts[0] = {
        ...parts[0],
        text: `${current}\n\n${sharedInstruction}`,
      };
    }
  } else {
    setup.systemInstruction = {
      parts: [{ text: sharedInstruction }],
    };
  }

  return JSON.stringify(payload);
}

export function NuboVoiceProfileRuntime() {
  useEffect(() => {
    const originalSend = WebSocket.prototype.send;

    WebSocket.prototype.send = function patchedNuboVoiceSend(
      data: string | ArrayBufferLike | Blob | ArrayBufferView,
    ) {
      const outgoing =
        typeof data === "string" && data.startsWith('{"setup":') &&
        this.url.includes("generativelanguage.googleapis.com")
          ? configureGeminiSetupPayload(data)
          : data;

      return Reflect.apply(originalSend, this, [outgoing]);
    };

    return () => {
      WebSocket.prototype.send = originalSend;
    };
  }, []);

  return null;
}
