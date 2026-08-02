"use client";

import { useEffect } from "react";
import {
  getNuboPersonalityInstruction,
  readNuboVoiceProfile,
} from "@/lib/nubo-voice-profile";

const PROFILE_MARKER = "NUBO_VOICE_PROFILE_V15";

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
  const parts = setup.systemInstruction?.parts;
  if (Array.isArray(parts) && parts.length > 0) {
    const current = String(parts[0]?.text ?? "");
    if (!current.includes(PROFILE_MARKER)) {
      parts[0] = {
        ...parts[0],
        text: `${current}\n\n${PROFILE_MARKER}\n${personality}`,
      };
    }
  } else {
    setup.systemInstruction = {
      parts: [{ text: `${PROFILE_MARKER}\n${personality}` }],
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
      if (
        typeof data === "string" &&
        this.url.includes("generativelanguage.googleapis.com")
      ) {
        return originalSend.call(this, configureGeminiSetupPayload(data));
      }

      return originalSend.call(this, data);
    };

    return () => {
      if (WebSocket.prototype.send !== originalSend) {
        WebSocket.prototype.send = originalSend;
      }
    };
  }, []);

  return null;
}
