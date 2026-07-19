"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __nuboLiveLatencyPatched?: boolean;
    __nuboOriginalWebSocketSend?: WebSocket["send"];
  }
}

const GEMINI_LIVE_HOST = "generativelanguage.googleapis.com";

/**
 * Applies a conservative low-latency Gemini Live VAD profile without touching
 * the stable voice-console state machine. The server's end-of-speech wait is
 * shortened while retaining enough silence tolerance for natural Mandarin.
 */
export function NuboLiveLatencyTuner() {
  useEffect(() => {
    if (!window.__nuboLiveLatencyPatched) {
      const originalSend = WebSocket.prototype.send;
      window.__nuboOriginalWebSocketSend = originalSend;

      WebSocket.prototype.send = function sendWithNuboLatencyTuning(
        data: string | ArrayBufferLike | Blob | ArrayBufferView,
      ) {
        let nextData = data;

        if (
          typeof data === "string" &&
          this.url.includes(GEMINI_LIVE_HOST)
        ) {
          try {
            const payload = JSON.parse(data) as {
              setup?: Record<string, unknown>;
            };

            if (payload.setup) {
              payload.setup.realtimeInputConfig = {
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
            // Non-setup Gemini messages pass through unchanged.
          }
        }

        return originalSend.call(this, nextData);
      };

      window.__nuboLiveLatencyPatched = true;
    }

    /*
     * Warm the two most common server paths while the user is looking at the
     * page. Failures are intentionally ignored because normal on-demand calls
     * remain available.
     */
    void Promise.allSettled([
      fetch("/api/gemini-token?warm=1", {
        cache: "no-store",
      }),
      fetch("/api/weather?location=" + encodeURIComponent("台南"), {
        cache: "no-store",
      }),
    ]);
  }, []);

  return null;
}
