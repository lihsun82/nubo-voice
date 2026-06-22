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
        throw new Error(payload.error ?? "無法讀取AI引擎設定");
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
            : "引擎設定錯誤",
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
          <span className="provider-label">語音引擎</span>
          <strong>{selected === "gemini" ? "Gemini Live" : selected === "openai" ? "OpenAI Realtime" : "尚未設定"}</strong>
        </div>
        <div className="provider-buttons">
          <button className={selected === "gemini" ? "selected" : ""} disabled={!geminiReady} onClick={() => setSelected("gemini")}>
            Gemini優先
          </button>
          <button className={selected === "openai" ? "selected" : ""} disabled={!openaiReady} onClick={() => setSelected("openai")}>
            OpenAI備援
          </button>
        </div>
        <small>工作鏈：{data.workChain.join(" → ")}</small>
      </div>
      {selected === "gemini" ? (
        <GeminiVoiceConsole />
      ) : selected === "openai" ? (
        <OpenAIVoiceConsole />
      ) : (
        <section className="console">
          <div className="error">請先設定GEMINI_API_KEY，或保留OPENAI_API_KEY作為語音備援。</div>
        </section>
      )}
    </>
  );
}
