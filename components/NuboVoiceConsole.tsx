"use client";

import { useEffect } from "react";
import { GeminiVoiceConsole } from "@/components/GeminiVoiceConsole";

const EXTERNAL_RETURN_KEY = "nubo_external_app_return_v1";

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
  }, []);

  useEffect(() => {
    const keepHealthySession = () => {
      if (document.visibilityState === "visible") {
        window.localStorage.removeItem(
          EXTERNAL_RETURN_KEY,
        );
      }
    };

    document.addEventListener(
      "visibilitychange",
      keepHealthySession,
      true,
    );
    window.addEventListener(
      "focus",
      keepHealthySession,
      true,
    );
    window.addEventListener(
      "pageshow",
      keepHealthySession,
      true,
    );

    keepHealthySession();

    return () => {
      document.removeEventListener(
        "visibilitychange",
        keepHealthySession,
        true,
      );
      window.removeEventListener(
        "focus",
        keepHealthySession,
        true,
      );
      window.removeEventListener(
        "pageshow",
        keepHealthySession,
        true,
      );
    };
  }, []);

  return <GeminiVoiceConsole />;
}
