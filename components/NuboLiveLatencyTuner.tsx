"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __nuboLiveLatencyPatched?: boolean;
  }
}

const PRIMARY_VOICE_HOST = "generativelanguage.googleapis.com";

/**
 * 套用保守的低延遲語音偵測設定，不改動既有語音狀態機。
 */
export function NuboLiveLatencyTuner() {
  useEffect(() => {
    if (!window.__nuboLiveLatencyPatched) {
      const originalSend = WebSocket.prototype.send;

      const patchedSend = function (
        this: WebSocket,
        data: unknown,
      ) {
        let nextData = data;

        if (
          typeof data === "string" &&
          this.url.includes(PRIMARY_VOICE_HOST)
        ) {
          try {
            const payload = JSON.parse(data) as {
              setup?: Record<string, unknown>;
            };

            if (payload.setup) {
              payload.setup["realtimeInputConfig"] = {
                automaticActivityDetection: {
                  disabled: false,
                  startOfSpeechSensitivity:
                    "START_SENSITIVITY_HIGH",
                  endOfSpeechSensitivity:
                    "END_SENSITIVITY_HIGH",
                  prefixPaddingMs: 80,
                  silenceDurationMs: 500,
                },
                activityHandling:
                  "START_OF_ACTIVITY_INTERRUPTS",
              };
              nextData = JSON.stringify(payload);
            }
          } catch {
            // 非設定訊息維持原樣送出。
          }
        }

        originalSend.call(this, nextData as never);
      };

      WebSocket.prototype.send =
        patchedSend as WebSocket["send"];
      window.__nuboLiveLatencyPatched = true;
    }

    void Promise.allSettled([
      fetch("/api/voice-session?warm=1", {
        cache: "no-store",
      }),
      fetch("/api/weather?location=" + encodeURIComponent("台南"), {
        cache: "no-store",
      }),
    ]);
  }, []);

  return null;
}
