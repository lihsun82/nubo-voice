"use client";

import { useEffect } from "react";

const GEMINI_SOCKET_PATTERN =
  /generativelanguage\.googleapis\.com\/ws\//i;

const VOICE_KEY = "nubo_gemini_voice_v1";
const PERSONALITY_KEY = "nubo_voice_personality_v1";

const ALLOWED_VOICES = new Set([
  "Achird",
  "Puck",
  "Sadachbia",
  "Charon",
  "Kore",
  "Sulafat",
]);

function readVoice() {
  const stored = window.localStorage.getItem(VOICE_KEY) || "Achird";
  return ALLOWED_VOICES.has(stored) ? stored : "Achird";
}

function readPersonalityInstruction() {
  const personality =
    window.localStorage.getItem(PERSONALITY_KEY) || "companion";

  if (personality === "playful") {
    return [
      "目前是俏皮兄弟模式。",
      "語氣活潑、有一點三八與幽默，可以偶爾自然輕笑或短暫吐槽，但不要每句都笑，也不要用文字硬唸哈哈哈。",
      "遇到旅館營運、Gmail、金錢、安全或正式工作時，自動收斂成精準專業語氣。",
      "使用者說認真一點時立即停止玩笑；說輕鬆一點時再恢復俏皮。",
    ].join("\n");
  }

  if (personality === "professional") {
    return [
      "目前是專業管家模式。",
      "語氣沉穩、精準、有條理，先給結論，再補必要資訊。",
      "避免過度寒暄、浮誇情緒與不必要笑聲。",
    ].join("\n");
  }

  if (personality === "minimal") {
    return [
      "目前是極簡快速模式。",
      "優先低延遲，通常用一到三句回答；工具完成後只回報結果與下一個必要動作。",
      "除非使用者明確要求詳細說明，否則不要長篇朗讀。",
    ].join("\n");
  }

  return [
    "目前是自然陪伴模式。",
    "像熟悉的朋友一樣自然、溫暖、有同理心，保持簡潔，不要刻意表演。",
    "可以有自然停頓與輕微情緒，但正式工作仍要準確可靠。",
  ].join("\n");
}

export function NuboGeminiVoiceProfileProbe() {
  useEffect(() => {
    const previousSend = WebSocket.prototype.send;

    function profileAwareSend(data) {
      let outgoing = data;

      if (
        GEMINI_SOCKET_PATTERN.test(this.url) &&
        typeof data === "string"
      ) {
        try {
          const message = JSON.parse(data);

          if (message?.setup) {
            const voiceName = readVoice();
            const personalityInstruction =
              readPersonalityInstruction();

            message.setup.generationConfig = {
              ...(message.setup.generationConfig || {}),
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName,
                  },
                },
              },
            };

            const currentParts = Array.isArray(
              message.setup.systemInstruction?.parts,
            )
              ? message.setup.systemInstruction.parts
              : [];

            if (currentParts.length > 0) {
              currentParts[0] = {
                ...currentParts[0],
                text: `${currentParts[0]?.text || ""}\n\n${personalityInstruction}`,
              };
            } else {
              currentParts.push({
                text: personalityInstruction,
              });
            }

            message.setup.systemInstruction = {
              parts: currentParts,
            };
            outgoing = JSON.stringify(message);
          }
        } catch {
          // 設定失敗時保留原始訊息，不得中斷語音連線。
        }
      }

      return previousSend.call(this, outgoing);
    }

    WebSocket.prototype.send = profileAwareSend;

    return () => {
      if (WebSocket.prototype.send === profileAwareSend) {
        WebSocket.prototype.send = previousSend;
      }
    };
  }, []);

  return null;
}
