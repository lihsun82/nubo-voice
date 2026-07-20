"use client";

import { useEffect, useState } from "react";
import { GeminiVoiceConsole as NuboPrimaryVoiceConsole } from "@/components/GeminiVoiceConsole";
import { NuboLiveLatencyTuner } from "@/components/NuboLiveLatencyTuner";

function isMobileBrowser() {
  const userAgent = window.navigator.userAgent;
  const isIpadOs =
    /Macintosh/i.test(userAgent) &&
    window.navigator.maxTouchPoints > 1;

  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    isIpadOs
  );
}

const TOKEN_SAVER_EVENT = "nubo-token-saver-idle";
const BACKGROUND_TRANSCRIPT_EVENT =
  "nubo-background-name-transcript";
const LEGACY_IDLE_PREFIX = "25秒沒有對話";
const MOBILE_STANDBY_TEXT =
  "NUBO手機持續聆聽中，直接說NUBO、兄弟或有人嗎即可繼續對話。";

export function NuboVoiceConsole() {
  const [voiceReady, setVoiceReady] = useState(false);

  useEffect(() => {
    /*
     * NUBO_PRIMARY_VOICE_ONLY_V1
     * 語音核心固定使用NUBO即時語音，並清除舊的備援語音偏好。
     * 文字工作鏈與其他後端設定不受影響。
     */
    window.localStorage.setItem(
      "nubo_voice_provider_v1",
      "gemini",
    );
    window.localStorage.setItem(
      "nubo_voice_provider_choice_v1",
      "gemini",
    );
    window.localStorage.removeItem(
      "nubo_openai_voice_v1",
    );

    if (!isMobileBrowser()) {
      setVoiceReady(true);
      return;
    }

    /*
     * 手機必須先清除舊待命旗標並安裝事件入口保護，
     * 再掛載唯一的即時語音連線，避免25秒事件關閉收音來源，
     * 也避免舊的瀏覽器語音監聽器造成提示音或無法喚醒。
     */
    window.localStorage.removeItem(
      "nubo_voice_auto_resume_v1",
    );
    window.localStorage.removeItem(
      "nubo_external_app_return_v1",
    );
    window.localStorage.removeItem(
      "nubo_external_companion_until_v1",
    );
    window.localStorage.removeItem(
      "nubo_token_saver_standby_v1",
    );
    window.localStorage.removeItem(
      "nubo_silent_until_wake",
    );

    const originalDispatchEvent = window.dispatchEvent;

    const mobileSafeDispatchEvent = function (
      this: Window,
      event: Event,
    ) {
      if (event.type === TOKEN_SAVER_EVENT) {
        window.localStorage.removeItem(
          "nubo_token_saver_standby_v1",
        );
        window.localStorage.removeItem(
          "nubo_silent_until_wake",
        );
        return true;
      }

      if (event.type === BACKGROUND_TRANSCRIPT_EVENT) {
        const transcript = (
          event as CustomEvent<{ transcript?: string }>
        ).detail?.transcript?.trim();

        if (transcript?.startsWith(LEGACY_IDLE_PREFIX)) {
          return originalDispatchEvent.call(
            window,
            new CustomEvent(BACKGROUND_TRANSCRIPT_EVENT, {
              detail: {
                transcript: MOBILE_STANDBY_TEXT,
              },
            }),
          );
        }
      }

      return originalDispatchEvent.call(window, event);
    } as typeof window.dispatchEvent;

    window.dispatchEvent = mobileSafeDispatchEvent;
    console.info(
      "[NUBO mobile wake] protection installed before primary voice mount",
    );
    setVoiceReady(true);

    return () => {
      if (window.dispatchEvent === mobileSafeDispatchEvent) {
        window.dispatchEvent = originalDispatchEvent;
      }
    };
  }, []);

  return (
    <>
      <NuboLiveLatencyTuner />
      {voiceReady ? <NuboPrimaryVoiceConsole /> : null}
    </>
  );
}
