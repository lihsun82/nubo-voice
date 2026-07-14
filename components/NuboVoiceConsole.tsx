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

async function loadProviderData(signal: AbortSignal): Promise<ProviderData> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const response = await fetch("/api/providers", {
        cache: "no-store",
        signal,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "無法讀取NUBO核心設定");
      }
      return payload;
    } catch (cause) {
      if (signal.aborted) throw cause;
      lastError = cause;
      await new Promise((resolve) => window.setTimeout(resolve, 750));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("NUBO後端尚未就緒，請重新整理頁面。");
}

export function NuboVoiceConsole() {
  const [data, setData] = useState<ProviderData | null>(null);
  const [selected, setSelected] = useState<VoiceProvider>("none");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    loadProviderData(controller.signal)
      .then((payload) => {
        setData(payload);
        setSelected(payload.voiceProvider);
        setError("");
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message === "Failed to fetch"
              ? "NUBO後端尚未完成啟動，請稍候後重新整理。"
              : cause.message
            : "核心設定錯誤",
        );
      });

    return () => controller.abort();
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <section className="console">正在等待NUBO後端啟動…</section>;

  const geminiReady = data.providers.some((item) => item.name === "gemini" && item.configured);
  const openaiReady = data.providers.some((item) => item.name === "openai" && item.configured);

  return (
    <>
      <div className="provider-switcher">
        <div>
          <span className="provider-label">NUBO 核心</span>
          <strong>{selected === "none" ? "尚未就緒" : selected === data.voiceProvider ? "主要語音核心" : "備援語音核心"}</strong>
        </div>
        <div className="provider-buttons">
          <button className={selected === "gemini" ? "selected" : ""} disabled={!geminiReady} onClick={() => setSelected("gemini")}>
            主要核心
          </button>
          <button className={selected === "openai" ? "selected" : ""} disabled={!openaiReady} onClick={() => setSelected("openai")}>
            備援核心
          </button>
        </div>
        <small>多重語音核心與自動備援已啟用</small>
      </div>
      {selected === "gemini" ? (
        <GeminiVoiceConsole />
      ) : selected === "openai" ? (
        <OpenAIVoiceConsole />
      ) : (
        <section className="console">
          <div className="error">語音服務尚未完成設定，請聯絡系統管理員。</div>
        </section>
      )}
    </>
  );
}
