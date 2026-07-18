"use client";

import { useEffect } from "react";

const GEMINI_SOCKET_PATTERN =
  /generativelanguage\.googleapis\.com\/ws\//i;

const VISION_SYSTEM_INSTRUCTION = [
  "NUBO視覺規則：",
  "- 當收到鏡頭畫面時，可以描述人物數量、可見衣著、動作、物品、文字與環境狀況。",
  "- 不得依臉部猜測或宣稱人物姓名、真實身分、國籍、宗教、疾病或其他敏感特徵。",
  "- 不確定的物品、文字或狀況要明確說不確定，不得硬猜。",
  "- 看一眼辨識時先說最重要的畫面結論，再補必要細節；不要朗讀冗長清單。",
  "- 持續觀察模式只在使用者提問或明顯要求提醒時回答，不要每收到一張影格就主動說話。",
].join("\n");

function dispatchVisionStatus(ok, message) {
  window.dispatchEvent(
    new CustomEvent("nubo-vision-status", {
      detail: { ok, message },
    }),
  );
}

export function NuboVisionSocketBridge() {
  useEffect(() => {
    const previousSend = WebSocket.prototype.send;
    let activeSocket = null;

    function visionAwareSend(data) {
      let outgoing = data;

      if (GEMINI_SOCKET_PATTERN.test(this.url)) {
        activeSocket = this;

        if (typeof data === "string") {
          try {
            const message = JSON.parse(data);

            if (message?.setup) {
              const parts = Array.isArray(
                message.setup.systemInstruction?.parts,
              )
                ? message.setup.systemInstruction.parts
                : [];

              if (parts.length > 0) {
                parts[0] = {
                  ...parts[0],
                  text: `${parts[0]?.text || ""}\n\n${VISION_SYSTEM_INSTRUCTION}`,
                };
              } else {
                parts.push({ text: VISION_SYSTEM_INSTRUCTION });
              }

              message.setup.systemInstruction = { parts };
              outgoing = JSON.stringify(message);
            }
          } catch {
            // 鏡頭橋接不得影響既有語音連線。
          }
        }
      }

      return previousSend.call(this, outgoing);
    }

    WebSocket.prototype.send = visionAwareSend;

    const handleFrame = (event) => {
      const detail = event.detail;
      const socket = activeSocket;

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        dispatchVisionStatus(
          false,
          "請先按「啟動NUBO」，連線成功後再使用鏡頭辨識。",
        );
        return;
      }

      if (typeof detail?.data !== "string" || detail.data.length < 100) {
        dispatchVisionStatus(false, "鏡頭畫面擷取失敗，請再試一次。");
        return;
      }

      try {
        socket.send(
          JSON.stringify({
            realtimeInput: {
              video: {
                data: detail.data,
                mimeType: detail.mimeType || "image/jpeg",
              },
            },
          }),
        );

        if (typeof detail.prompt === "string" && detail.prompt.trim()) {
          window.setTimeout(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(
                JSON.stringify({
                  realtimeInput: {
                    text: detail.prompt.trim(),
                  },
                }),
              );
            }
          }, 120);
        }

        dispatchVisionStatus(
          true,
          detail.prompt
            ? "畫面已送給NUBO分析，正在等待語音回答。"
            : "持續觀察中：畫面已即時送入Gemini Live。",
        );
      } catch (error) {
        dispatchVisionStatus(
          false,
          error instanceof Error
            ? `鏡頭畫面傳送失敗：${error.message}`
            : "鏡頭畫面傳送失敗。",
        );
      }
    };

    const clearClosedSocket = () => {
      if (activeSocket?.readyState === WebSocket.CLOSED) {
        activeSocket = null;
      }
    };

    window.addEventListener("nubo-vision-frame", handleFrame);
    window.addEventListener("focus", clearClosedSocket);

    return () => {
      window.removeEventListener("nubo-vision-frame", handleFrame);
      window.removeEventListener("focus", clearClosedSocket);

      if (WebSocket.prototype.send === visionAwareSend) {
        WebSocket.prototype.send = previousSend;
      }
      activeSocket = null;
    };
  }, []);

  return null;
}
