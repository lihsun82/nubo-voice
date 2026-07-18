"use client";

import { useEffect } from "react";

const GEMINI_SOCKET_PATTERN =
  /generativelanguage\.googleapis\.com\/ws\//i;

const VISION_SYSTEM_INSTRUCTION = [
  "NUBO視覺規則：",
  "- 當收到鏡頭畫面時，可以描述人物數量、可見衣著、動作、物品、文字與環境狀況。",
  "- 不得依臉部猜測或宣稱人物姓名、真實身分、國籍、宗教、疾病或其他敏感特徵。",
  "- 不確定的物品、文字或狀況要明確說不確定，不得硬猜。",
  "- 快速辨識最多三句；高細節辨識最多四句，先給結論，不要朗讀冗長清單。",
  "- 持續觀察只在使用者提問或明確要求提醒時回答，不要每收到一張影格就主動說話。",
].join("\n");

function dispatchVisionStatus(ok, message, extra = {}) {
  window.dispatchEvent(
    new CustomEvent("nubo-vision-status", {
      detail: { ok, message, ...extra },
    }),
  );
}

async function parseSocketMessage(data) {
  try {
    let text;
    if (typeof data === "string") text = data;
    else if (data instanceof Blob) text = await data.text();
    else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    else if (ArrayBuffer.isView(data)) text = new TextDecoder().decode(data);
    else return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function containsModelResponse(message) {
  const serverContent = message?.serverContent;
  if (!serverContent) return false;

  if (
    typeof serverContent.outputTranscription?.text === "string" &&
    serverContent.outputTranscription.text.trim()
  ) {
    return true;
  }

  const parts = serverContent.modelTurn?.parts;
  return (
    Array.isArray(parts) &&
    parts.some(
      (part) =>
        typeof part?.inlineData?.data === "string" ||
        (typeof part?.text === "string" && part.text.trim()),
    )
  );
}

export function NuboVisionSocketBridge() {
  useEffect(() => {
    const previousSend = WebSocket.prototype.send;
    const observedSockets = new WeakSet();
    let activeSocket = null;
    let pendingVisionAt = 0;
    let pendingMode = "fast";

    const attachResponseObserver = (socket) => {
      if (observedSockets.has(socket)) return;
      observedSockets.add(socket);

      socket.addEventListener("message", (event) => {
        if (!pendingVisionAt) return;

        void parseSocketMessage(event.data).then((message) => {
          if (!message || !containsModelResponse(message) || !pendingVisionAt) {
            return;
          }

          const latencyMs = Math.max(
            0,
            Math.round(performance.now() - pendingVisionAt),
          );
          pendingVisionAt = 0;

          dispatchVisionStatus(
            true,
            `${pendingMode === "detail" ? "高細節" : "快速"}辨識已開始回覆，視覺首回應約${latencyMs}ms。`,
            { latencyMs, mode: pendingMode },
          );
        });
      });

      socket.addEventListener("close", () => {
        if (activeSocket === socket) activeSocket = null;
        pendingVisionAt = 0;
      });
    };

    function visionAwareSend(data) {
      let outgoing = data;

      if (GEMINI_SOCKET_PATTERN.test(this.url)) {
        activeSocket = this;
        attachResponseObserver(this);

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
        const prompt =
          typeof detail.prompt === "string" ? detail.prompt.trim() : "";
        const realtimeInput = {
          video: {
            data: detail.data,
            mimeType: detail.mimeType || "image/jpeg",
          },
          ...(prompt ? { text: prompt } : {}),
        };

        if (prompt) {
          pendingVisionAt = performance.now();
          pendingMode = detail.mode === "detail" ? "detail" : "fast";
        }

        socket.send(JSON.stringify({ realtimeInput }));

        const kilobytes =
          typeof detail.bytes === "number"
            ? Math.max(1, Math.round(detail.bytes / 1024))
            : null;
        const encodeMs =
          typeof detail.encodeMs === "number"
            ? Math.round(detail.encodeMs)
            : null;

        dispatchVisionStatus(
          true,
          prompt
            ? `影像與辨識指令已一次送出${kilobytes ? `，約${kilobytes}KB` : ""}${encodeMs !== null ? `，手機壓縮${encodeMs}ms` : ""}。`
            : "省流量持續觀察中：只傳送有明顯變化的畫面。",
          {
            bytes: detail.bytes,
            encodeMs,
            mode: detail.mode || "fast",
          },
        );
      } catch (error) {
        pendingVisionAt = 0;
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
        pendingVisionAt = 0;
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
      pendingVisionAt = 0;
    };
  }, []);

  return null;
}
