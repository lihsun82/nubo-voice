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
     * 手機不能同時兼顧「25秒完全關閉麥克風」與「純語音喚醒」：
     * 完全關閉後，瀏覽器沒有任何收音來源可聽見NUBO喚醒詞。
     * 因此手機改成柔性待命：攔截自動關閉事件，保留原本Gemini
     * 單一麥克風連線，避免Web Speech反覆開關造成嘟嘟聲，同時
     * 讓NUBO、兄弟、有人嗎等喚醒語句仍可立即被聽見。
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

    const keepMobileWakeAvailable = (event: Event) => {
      event.stopImmediatePropagation();
      window.localStorage.removeItem(
        "nubo_token_saver_standby_v1",
      );
      window.localStorage.removeItem(
        "nubo_silent_until_wake",
      );

      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent(
            "nubo-background-name-transcript",
            {
              detail: {
                transcript:
                  "NUBO手機持續待命中，直接說NUBO、兄弟或有人嗎即可繼續對話。",
              },
            },
          ),
        );
      }, 0);
    };

    window.addEventListener(
      "nubo-token-saver-idle",
      keepMobileWakeAvailable,
      true,
    );

    return () => {
      window.removeEventListener(
        "nubo-token-saver-idle",
        keepMobileWakeAvailable,
        true,
      );
    };
  }, []);

  return (
    <>
      <NuboLiveLatencyTuner />
      <GeminiVoiceConsole />
    </>
  );
}
