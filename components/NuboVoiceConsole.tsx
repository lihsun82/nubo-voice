"use client";

import { useEffect, useState } from "react";
import { GeminiVoiceConsole } from "@/components/GeminiVoiceConsole";
import { OpenAIVoiceConsole } from "@/components/OpenAIVoiceConsole";

type VoiceProvider = "gemini" | "openai" | "none";

type ProviderData = {
  voiceProvider: VoiceProvider;
  workChain: string[];
  researchChain: string[];
  providers: Array<{ name: string; configured: boolean; model: string }>;
};

const PROVIDER_CACHE_KEY = "nubo_voice_provider_v1";

async function loadProviderData(
  signal: AbortSignal,
): Promise<ProviderData> {
  let lastError: unknown;

  /*
   * NUBO_MOBILE_FAST_BOOT_V1
   * 語音介面會先以既有Gemini設定立即啟動，
   * 服務設定只在背景同步，因此這裡不再阻塞畫面15秒。
   */
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch("/api/providers", {
        cache: "no-store",
        signal,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "無法讀取NUBO服務設定");
      }
      return payload;
    } catch (cause) {
      if (signal.aborted) throw cause;
      lastError = cause;
      if (attempt < 4) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, 400 * attempt),
        );
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("NUBO後端尚未就緒");
}

export function NuboVoiceConsole() {
  /*
   * 專案目前正式語音核心是Gemini。
   * 直接先渲染語音主控台，可同時執行Token預熱，
   * 不必等待/api/providers往返後才開始載入。
   */
  const [selected, setSelected] =
    useState<VoiceProvider>("gemini");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    const cached = window.localStorage.getItem(
      PROVIDER_CACHE_KEY,
    );
    if (
      cached === "gemini" ||
      cached === "openai"
    ) {
      setSelected(cached);
    }

    const controller = new AbortController();

    loadProviderData(controller.signal)
      .then((payload) => {
        setSelected(payload.voiceProvider);
        setWarning("");
        if (
          payload.voiceProvider === "gemini" ||
          payload.voiceProvider === "openai"
        ) {
          window.localStorage.setItem(
            PROVIDER_CACHE_KEY,
            payload.voiceProvider,
          );
        }
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        /*
         * 已快取的語音核心仍可繼續啟動；
         * 不再用整頁錯誤阻擋手機NUBO。
         */
        setWarning(
          cause instanceof Error
            ? cause.message
            : "服務設定背景同步失敗",
        );
      });

    return () => controller.abort();
  }, []);

  const console =
    selected === "gemini" ? (
      <GeminiVoiceConsole />
    ) : selected === "openai" ? (
      <OpenAIVoiceConsole />
    ) : (
      <section className="console">
        <div className="error">
          語音服務尚未完成設定，請聯絡系統管理員。
        </div>
      </section>
    );

  return (
    <>
      {warning ? (
        <div className="status-note" role="status">
          NUBO設定正在背景同步；語音介面已先啟動。
        </div>
      ) : null}
      {console}
    </>
  );
}
