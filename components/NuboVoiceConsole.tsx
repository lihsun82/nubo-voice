"use client";

import { useEffect, useMemo, useState } from "react";
import { GeminiVoiceConsole } from "@/components/GeminiVoiceConsole";
import { OpenAIVoiceConsole } from "@/components/OpenAIVoiceConsole";
import styles from "@/components/NuboVoiceProfile.module.css";
import {
  defaultNuboVoiceProfile,
  geminiVoiceOptions,
  openaiVoiceOptions,
  personalityOptions,
  readNuboVoiceProfile,
  saveNuboVoiceProfile,
  type NuboVoiceProfile,
  type NuboVoiceProvider,
} from "@/lib/nubo-voice-profile";

type VoiceProvider = "gemini" | "openai" | "none";

type ProviderData = {
  voiceProvider: VoiceProvider;
  workChain: string[];
  researchChain: string[];
  providers: Array<{
    name: string;
    configured: boolean;
    model: string;
  }>;
};

const PROVIDER_CACHE_KEY =
  "nubo_voice_provider_v1";
const EXTERNAL_RETURN_KEY =
  "nubo_external_app_return_v1";

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
        throw new Error(
          payload.error ??
            "無法讀取NUBO服務設定",
        );
      }
      return payload;
    } catch (cause) {
      if (signal.aborted) throw cause;
      lastError = cause;
      if (attempt < 4) {
        await new Promise((resolve) =>
          window.setTimeout(
            resolve,
            400 * attempt,
          ),
        );
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("NUBO後端尚未就緒");
}

function providerConfigured(
  payload: ProviderData,
  provider: NuboVoiceProvider,
) {
  return payload.providers.some(
    (item) =>
      item.name === provider && item.configured,
  );
}

export function NuboVoiceConsole() {
  const [profile, setProfile] =
    useState<NuboVoiceProfile>(
      defaultNuboVoiceProfile,
    );
  const [draft, setDraft] =
    useState<NuboVoiceProfile>(
      defaultNuboVoiceProfile,
    );
  const [availability, setAvailability] =
    useState<Record<NuboVoiceProvider, boolean>>({
      gemini: true,
      openai: false,
    });
  const [warning, setWarning] = useState("");
  const [settingsStatus, setSettingsStatus] =
    useState("");

  useEffect(() => {
    const stored = readNuboVoiceProfile();
    setProfile(stored);
    setDraft(stored);
    window.localStorage.setItem(
      PROVIDER_CACHE_KEY,
      stored.provider,
    );

    const controller = new AbortController();

    loadProviderData(controller.signal)
      .then((payload) => {
        const nextAvailability = {
          gemini: providerConfigured(
            payload,
            "gemini",
          ),
          openai: providerConfigured(
            payload,
            "openai",
          ),
        };
        setAvailability(nextAvailability);
        setWarning("");

        if (!nextAvailability[stored.provider]) {
          const fallback =
            payload.voiceProvider === "openai" &&
            nextAvailability.openai
              ? "openai"
              : nextAvailability.gemini
                ? "gemini"
                : nextAvailability.openai
                  ? "openai"
                  : null;

          if (fallback) {
            const nextProfile = {
              ...stored,
              provider: fallback,
            };
            saveNuboVoiceProfile(nextProfile);
            setProfile(nextProfile);
            setDraft(nextProfile);
            window.localStorage.setItem(
              PROVIDER_CACHE_KEY,
              fallback,
            );
          }
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
      if (
        document.visibilityState === "visible"
      ) {
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

  const selectedVoiceOptions =
    draft.provider === "openai"
      ? openaiVoiceOptions
      : geminiVoiceOptions;

  const selectedVoice =
    draft.provider === "openai"
      ? draft.openaiVoice
      : draft.geminiVoice;

  const currentSummary = useMemo(() => {
    const voices =
      profile.provider === "openai"
        ? openaiVoiceOptions
        : geminiVoiceOptions;
    const voiceId =
      profile.provider === "openai"
        ? profile.openaiVoice
        : profile.geminiVoice;
    const voice = voices.find(
      (option) => option.id === voiceId,
    );
    const personality = personalityOptions.find(
      (option) =>
        option.id === profile.personality,
    );

    return `${
      profile.provider === "openai"
        ? "OpenAI Realtime"
        : "Gemini Live"
    }／${voice?.label ?? voiceId}／${
      personality?.label ?? profile.personality
    }`;
  }, [profile]);

  const applySettings = () => {
    if (!availability[draft.provider]) {
      setSettingsStatus(
        draft.provider === "openai"
          ? "OpenAI API尚未設定，請先確認OPENAI_API_KEY。"
          : "Gemini API尚未設定，無法套用。",
      );
      return;
    }

    saveNuboVoiceProfile(draft);
    window.localStorage.setItem(
      PROVIDER_CACHE_KEY,
      draft.provider,
    );
    setSettingsStatus(
      "設定已儲存，正在重新啟動語音核心…",
    );
    window.setTimeout(() => {
      window.location.reload();
    }, 350);
  };

  const voiceDescription =
    selectedVoiceOptions.find(
      (option) => option.id === selectedVoice,
    )?.description ?? "";

  return (
    <>
      <section className={styles.panel}>
        <div className={styles.heading}>
          <div>
            <div className="provider-label">
              NUBO VOICE STUDIO
            </div>
            <strong>語音引擎、聲線與個性</strong>
            <small>目前：{currentSummary}</small>
          </div>
          <div className="provider-buttons">
            <button
              type="button"
              className={
                draft.provider === "gemini"
                  ? "selected"
                  : ""
              }
              disabled={!availability.gemini}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  provider: "gemini",
                }))
              }
            >
              Gemini Live
            </button>
            <button
              type="button"
              className={
                draft.provider === "openai"
                  ? "selected"
                  : ""
              }
              disabled={!availability.openai}
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  provider: "openai",
                }))
              }
            >
              OpenAI擬人語音
            </button>
          </div>
        </div>

        <div className={styles.grid}>
          <label className={styles.field}>
            <span>聲線</span>
            <select
              className={styles.select}
              value={selectedVoice}
              onChange={(event) => {
                const value = event.target.value;
                setDraft((current) =>
                  current.provider === "openai"
                    ? {
                        ...current,
                        openaiVoice: value,
                      }
                    : {
                        ...current,
                        geminiVoice: value,
                      },
                );
              }}
            >
              {selectedVoiceOptions.map(
                (option) => (
                  <option
                    key={option.id}
                    value={option.id}
                  >
                    {option.label}
                  </option>
                ),
              )}
            </select>
            <small>{voiceDescription}</small>
          </label>

          <div className={styles.field}>
            <span>個性模式</span>
            <div className={styles.personalityButtons}>
              {personalityOptions.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={`${styles.personalityButton} ${
                    draft.personality === option.id
                      ? styles.selectedPersonality
                      : ""
                  }`}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      personality: option.id,
                    }))
                  }
                >
                  <b>{option.label}</b>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className="primary"
            onClick={applySettings}
          >
            套用語音設定
          </button>
          <small>
            套用時會重新載入頁面並結束目前對話；下次啟動NUBO即使用新聲線。
          </small>
        </div>
        {settingsStatus ? (
          <div className="status-note" role="status">
            {settingsStatus}
          </div>
        ) : null}
      </section>

      {warning ? (
        <div className="status-note" role="status">
          NUBO設定正在背景同步；語音介面已先啟動。
        </div>
      ) : null}

      {profile.provider === "openai" ? (
        <OpenAIVoiceConsole />
      ) : (
        <GeminiVoiceConsole />
      )}
    </>
  );
}
