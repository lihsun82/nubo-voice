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

export function MultiVoiceConsole() {
  const [data, setData] = useState<ProviderData | null>(null);
  const [selected, setSelected] = useState<VoiceProvider>("none");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/providers", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "無法讀取AI引擎設定");
        setData(payload);
        setSelected(payload.voiceProvider);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "引擎設定錯誤"));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <section className="console">正在載入AI引擎…</section>;

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
