"use client";

import { useEffect, useState } from "react";
import { GeminiVoiceConsole } from "@/components/GeminiVoiceConsole";
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
     * NUBO_GEMINI_ONLY_V1
     * 語音核心固定使用Gemini Live，並清除舊的OpenAI語音偏好。
     * OpenAI文字模型與其他工作鏈設定不受影響。
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
     * 真正原因有兩層：
     * 1. 25秒事件會先抵達手機背景監聽器，監聽器直接按下「結束對話」。
     * 2. Gemini子元件比父層effect更早掛載時，可能已把舊的靜音旗標
     *    讀入silentUntilWakeRef；父層稍後只清localStorage也無法改掉ref。
     *
     * 因此手機先清除所有舊旗標、安裝事件入口保護，完成後才掛載
     * GeminiVoiceConsole。這樣25秒後保留Gemini單一麥克風，不啟用會
     * 嘟嘟響的Web Speech，也不會殘留無法喚醒的靜音ref。
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
      "[NUBO mobile wake] protection installed before Gemini voice mount",
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
      {voiceReady ? <GeminiVoiceConsole /> : null}
    </>
  );
}
