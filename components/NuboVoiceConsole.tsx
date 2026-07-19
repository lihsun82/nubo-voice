"use client";

import { useEffect, useState } from "react";
import { GeminiVoiceConsole } from "@/components/GeminiVoiceConsole";
import { NuboExternalCompanion } from "@/components/NuboExternalCompanion";
import { NuboLiveLatencyTuner } from "@/components/NuboLiveLatencyTuner";
import { XiaozhiVoiceConsole } from "@/components/XiaozhiVoiceConsole";

type VoiceProvider = "gemini" | "xiaozhi";

const PROVIDER_STORAGE_KEY = "nubo_voice_provider_choice_v2";

function stopActiveVoiceConsole() {
  window.speechSynthesis?.cancel();
  document.querySelectorAll<HTMLAudioElement>("audio").forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });

  const endButton = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => {
    const label = (button.textContent ?? "").replace(/\s+/g, "");
    return label.includes("結束對話") && !button.disabled;
  });

  endButton?.click();
}

export function NuboVoiceConsole() {
  const [provider, setProvider] = useState<VoiceProvider>("gemini");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(PROVIDER_STORAGE_KEY);
    const initial: VoiceProvider = saved === "xiaozhi" ? "xiaozhi" : "gemini";
    setProvider(initial);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;

    window.localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
    window.localStorage.setItem("nubo_voice_provider_v1", provider);
    window.localStorage.setItem("nubo_voice_provider_choice_v1", provider);

    if (provider === "gemini") {
      window.localStorage.removeItem("nubo_openai_voice_v1");
    }
  }, [provider, ready]);

  const selectProvider = (next: VoiceProvider) => {
    if (next === provider) return;
    stopActiveVoiceConsole();
    setProvider(next);
  };

  return (
    <>
      <section className="provider-switcher" aria-label="NUBO語音核心選擇">
        <div>
          <span className="provider-label">VOICE CORE</span>
          <strong>
            {provider === "gemini" ? "Gemini Live" : "小智 Opus 自架模式"}
          </strong>
        </div>
        <div className="provider-buttons">
          <button
            type="button"
            className={provider === "gemini" ? "selected" : ""}
            aria-pressed={provider === "gemini"}
            onClick={() => selectProvider("gemini")}
          >
            Gemini Live
          </button>
          <button
            type="button"
            className={provider === "xiaozhi" ? "selected" : ""}
            aria-pressed={provider === "xiaozhi"}
            onClick={() => selectProvider("xiaozhi")}
          >
            小智 Opus
          </button>
        </div>
        <small>
          Gemini 保留目前 NUBO 全部語音與工具；小智模式只連接你設定的自架 H5／WebSocket 服務，不使用公開第三方後端。
        </small>
      </section>

      {ready && provider === "xiaozhi" ? (
        <XiaozhiVoiceConsole />
      ) : (
        <>
          <NuboLiveLatencyTuner />
          <NuboExternalCompanion />
          <GeminiVoiceConsole />
        </>
      )}
    </>
  );
}
