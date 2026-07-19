"use client";

import { useEffect } from "react";
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

    if (!isMobileBrowser()) return;

    /*
     * 手機純語音喚醒必須保留Gemini的單一麥克風連線。
     * 舊版在25秒時先廣播省Token事件，背景監聽器收到後會按下
     * 「結束對話」；之後即使畫面上的攔截器再清除旗標，連線也
     * 已經被關閉，所以喚醒詞完全沒有收音來源。
     *
     * 這裡直接在window.dispatchEvent入口攔截手機的省Token事件，
     * 讓它不會抵達任何會關閉Gemini的舊監聽器；同時把舊的
     * 「已關閉收音」提示改成正確的持續聆聽提示。桌機不受影響。
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

    return () => {
      if (window.dispatchEvent === mobileSafeDispatchEvent) {
        window.dispatchEvent = originalDispatchEvent;
      }
    };
  }, []);

  return (
    <>
      <NuboLiveLatencyTuner />
      <GeminiVoiceConsole />
    </>
  );
}
