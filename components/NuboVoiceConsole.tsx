"use client";

import { useEffect } from "react";
import { GeminiVoiceConsole } from "@/components/GeminiVoiceConsole";
import { NuboExternalCompanion } from "@/components/NuboExternalCompanion";
import { NuboLiveLatencyTuner } from "@/components/NuboLiveLatencyTuner";

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

  return (
    <>
      <NuboLiveLatencyTuner />
      <NuboExternalCompanion />
      <GeminiVoiceConsole />
    </>
  );
}
