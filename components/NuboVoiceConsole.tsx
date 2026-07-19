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

    if (isMobileBrowser()) {
      const wasAutomaticStandby =
        window.localStorage.getItem(
          "nubo_token_saver_standby_v1",
        ) === "true";

      /*
       * 舊版會把自動續接旗標永久留在手機，導致每次開啟或切回
       * NUBO時重建麥克風，部分Android會連續播放「嘟」聲。
       * 手機改為只在可見頁面由使用者啟動Gemini Live。
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

      if (wasAutomaticStandby) {
        window.localStorage.removeItem(
          "nubo_silent_until_wake",
        );
      }
    }
  }, []);

  return (
    <>
      <NuboLiveLatencyTuner />
      <GeminiVoiceConsole />
    </>
  );
}
