"use client";

import { useEffect } from "react";
import { GeminiVoiceConsole } from "@/components/GeminiVoiceConsole";
import { NuboExternalCompanion } from "@/components/NuboExternalCompanion";
import { NuboLiveLatencyTuner } from "@/components/NuboLiveLatencyTuner";

export function NuboVoiceConsole() {
  useEffect(() => {
    window.localStorage.setItem("nubo_voice_provider_choice_v2", "gemini");
    window.localStorage.setItem("nubo_voice_provider_v1", "gemini");
    window.localStorage.setItem("nubo_voice_provider_choice_v1", "gemini");
    window.localStorage.removeItem("nubo_xiaozhi_h5_url_v1");
  }, []);

  return (
    <>
      <NuboLiveLatencyTuner />
      <NuboExternalCompanion />
      <GeminiVoiceConsole />
    </>
  );
}
