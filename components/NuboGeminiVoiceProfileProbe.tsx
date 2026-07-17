"use client";

import { useEffect } from "react";
import {
  getNuboPersonalityInstruction,
  readNuboVoiceProfile,
} from "@/lib/nubo-voice-profile";

const GEMINI_SOCKET_PATTERN =
  /generativelanguage\.googleapis\.com\/ws\//i;

export function NuboGeminiVoiceProfileProbe() {
  useEffect(() => {
    const originalSend = WebSocket.prototype.send;

    function profileAwareSend(
      this: WebSocket,
      data: string | ArrayBufferLike | Blob | ArrayBufferView,
    ) {
      let nextData = data;

      if (
        GEMINI_SOCKET_PATTERN.test(this.url) &&
        typeof data === "string"
      ) {
        try {
          const message = JSON.parse(data) as {
            setup?: {
              generationConfig?: Record<string, unknown>;
              systemInstruction?: {
                parts?: Array<{ text?: string }>;
              };
            };
          };

          if (message.setup) {
            const profile = readNuboVoiceProfile();
            const generationConfig =
              message.setup.generationConfig ?? {};

            message.setup.generationConfig = {
              ...generationConfig,
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: profile.geminiVoice,
                  },
                },
              },
            };

            const personalityInstruction =
              getNuboPersonalityInstruction(
                profile.personality,
              );
            const parts =
              message.setup.systemInstruction?.parts ?? [];

            if (parts.length > 0) {
              parts[0] = {
                ...parts[0],
                text: `${parts[0].text ?? ""}\n\n${personalityInstruction}`,
              };
            } else {
              parts.push({ text: personalityInstruction });
            }

            message.setup.systemInstruction = { parts };
            nextData = JSON.stringify(message);
          }
        } catch {
          // 設定探針失敗時保留原始Gemini訊息，不中斷語音。
        }
      }

      return originalSend.call(this, nextData);
    }

    WebSocket.prototype.send = profileAwareSend;

    return () => {
      if (WebSocket.prototype.send === profileAwareSend) {
        WebSocket.prototype.send = originalSend;
      }
    };
  }, []);

  return null;
}
