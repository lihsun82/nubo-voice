"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/components/NuboVoiceStudio.module.css";

const STORAGE_KEYS = {
  provider: "nubo_voice_provider_choice_v1",
  geminiVoice: "nubo_gemini_voice_v1",
  openaiVoice: "nubo_openai_voice_v1",
  personality: "nubo_voice_personality_v1",
};

const GEMINI_VOICES = [
  ["Achird", "Achird｜親切自然"],
  ["Puck", "Puck｜活潑俏皮"],
  ["Sadachbia", "Sadachbia｜生動有戲"],
  ["Charon", "Charon｜資訊專業"],
  ["Kore", "Kore｜堅定專業"],
  ["Sulafat", "Sulafat｜溫暖陪伴"],
];

const OPENAI_VOICES = [
  ["marin", "Marin｜高擬人自然"],
  ["cedar", "Cedar｜沉穩專業"],
  ["coral", "Coral｜明亮有活力"],
  ["sage", "Sage｜知性柔和"],
];

const PERSONALITIES = [
  ["playful", "俏皮兄弟", "有一點三八、會吐槽，偶爾自然輕笑。"],
  ["professional", "專業管家", "精準、沉穩、工作導向。"],
  ["companion", "自然陪伴", "像熟悉的朋友，溫暖、有同理心。"],
  ["minimal", "極簡快速", "優先速度，只說必要內容。"],
];

function readStoredProfile() {
  if (typeof window === "undefined") {
    return {
      provider: "gemini",
      geminiVoice: "Achird",
      openaiVoice: "marin",
      personality: "companion",
    };
  }

  return {
    provider:
      window.localStorage.getItem(STORAGE_KEYS.provider) === "openai"
        ? "openai"
        : "gemini",
    geminiVoice:
      window.localStorage.getItem(STORAGE_KEYS.geminiVoice) || "Achird",
    openaiVoice:
      window.localStorage.getItem(STORAGE_KEYS.openaiVoice) || "marin",
    personality:
      window.localStorage.getItem(STORAGE_KEYS.personality) || "companion",
  };
}

export function NuboVoiceStudio() {
  const [profile, setProfile] = useState(() => readStoredProfile());
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setProfile(readStoredProfile());

    const controller = new AbortController();
    fetch("/api/providers", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((payload) => {
        const configured = Array.isArray(payload.providers)
          ? payload.providers.some(
              (item) => item?.name === "openai" && item?.configured === true,
            )
          : false;
        setOpenaiConfigured(configured);
      })
      .catch(() => {
        setOpenaiConfigured(false);
      });

    return () => controller.abort();
  }, []);

  const voices = profile.provider === "openai" ? OPENAI_VOICES : GEMINI_VOICES;
  const selectedVoice =
    profile.provider === "openai" ? profile.openaiVoice : profile.geminiVoice;

  const currentLabel = useMemo(() => {
    const voice = voices.find((item) => item[0] === selectedVoice)?.[1] || selectedVoice;
    const personality =
      PERSONALITIES.find((item) => item[0] === profile.personality)?.[1] ||
      profile.personality;
    return `${profile.provider === "openai" ? "OpenAI Realtime" : "Gemini Live"}／${voice}／${personality}`;
  }, [profile, selectedVoice, voices]);

  const apply = () => {
    if (profile.provider === "openai" && !openaiConfigured) {
      setStatus("OpenAI API尚未設定，請先確認OPENAI_API_KEY。");
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.provider, profile.provider);
    window.localStorage.setItem(STORAGE_KEYS.geminiVoice, profile.geminiVoice);
    window.localStorage.setItem(STORAGE_KEYS.openaiVoice, profile.openaiVoice);
    window.localStorage.setItem(STORAGE_KEYS.personality, profile.personality);
    window.localStorage.setItem("nubo_voice_provider_v1", profile.provider);
    setStatus("設定已儲存，正在重新啟動語音核心…");
    window.setTimeout(() => window.location.reload(), 350);
  };

  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <div className="provider-label">NUBO VOICE STUDIO</div>
          <strong>語音引擎、聲線與個性</strong>
          <small>目前選擇：{currentLabel}</small>
        </div>
        <div className="provider-buttons">
          <button
            type="button"
            className={profile.provider === "gemini" ? "selected" : ""}
            onClick={() =>
              setProfile((current) => ({ ...current, provider: "gemini" }))
            }
          >
            Gemini Live
          </button>
          <button
            type="button"
            className={profile.provider === "openai" ? "selected" : ""}
            disabled={!openaiConfigured}
            onClick={() =>
              setProfile((current) => ({ ...current, provider: "openai" }))
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
            value={selectedVoice}
            onChange={(event) => {
              const value = event.target.value;
              setProfile((current) =>
                current.provider === "openai"
                  ? { ...current, openaiVoice: value }
                  : { ...current, geminiVoice: value },
              );
            }}
          >
            {voices.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.field}>
          <span>個性模式</span>
          <div className={styles.personalities}>
            {PERSONALITIES.map(([id, label, description]) => (
              <button
                type="button"
                key={id}
                className={`${styles.personality} ${
                  profile.personality === id ? styles.selected : ""
                }`}
                onClick={() =>
                  setProfile((current) => ({ ...current, personality: id }))
                }
              >
                <b>{label}</b>
                <small>{description}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className="primary" onClick={apply}>
          套用語音設定
        </button>
        <small>套用時會重新載入頁面；下一次啟動NUBO使用新設定。</small>
      </div>
      {status ? <div className="status-note">{status}</div> : null}
    </section>
  );
}
