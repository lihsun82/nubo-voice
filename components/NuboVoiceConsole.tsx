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
const PROVIDER_CHOICE_KEY = "nubo_voice_provider_choice_v1";
const EXTERNAL_RETURN_KEY = "nubo_external_app_return_v1";

async function loadProviderData(
  signal: AbortSignal,
): Promise<ProviderData> {
  let lastError: unknown;

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

function isConfigured(
  payload: ProviderData,
  provider: "gemini" | "openai",
) {
  return payload.providers.some(
    (item) => item.name === provider && item.configured,
  );
}

export function NuboVoiceConsole() {
  const [selected, setSelected] =
    useState<VoiceProvider>("gemini");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    const storedChoice = window.localStorage.getItem(
      PROVIDER_CHOICE_KEY,
    );
    const cached = window.localStorage.getItem(
      PROVIDER_CACHE_KEY,
    );
    const preferred =
      storedChoice === "gemini" || storedChoice === "openai"
        ? storedChoice
        : cached === "gemini" || cached === "openai"
          ? cached
          : null;

    if (preferred) {
      setSelected(preferred);
    }

    const controller = new AbortController();

    loadProviderData(controller.signal)
      .then((payload) => {
        const resolved =
          preferred && isConfigured(payload, preferred)
            ? preferred
            : payload.voiceProvider;

        setSelected(resolved);
        setWarning("");
        if (resolved === "gemini" || resolved === "openai") {
          window.localStorage.setItem(
            PROVIDER_CACHE_KEY,
            resolved,
          );
        }
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setWarning(
          cause instanceof Error
            ? cause.message
            : "服務設定背景同步失敗",
        );
      });

    return () => controller.abort();
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
