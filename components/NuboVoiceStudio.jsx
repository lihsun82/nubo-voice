"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/components/NuboVoiceStudio.module.css";

const STORAGE_KEYS = {
  geminiVoice: "nubo_gemini_voice_v1",
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

const PERSONALITIES = [
  ["playful", "俏皮兄弟", "有一點三八、會吐槽，偶爾自然輕笑。"],
  ["professional", "專業管家", "精準、沉穩、工作導向。"],
  ["companion", "自然陪伴", "像熟悉的朋友，溫暖、有同理心。"],
  ["minimal", "極簡快速", "優先速度，只說必要內容。"],
];

function readStoredProfile() {
  if (typeof window === "undefined") {
    return {
      geminiVoice: "Achird",
      personality: "companion",
    };
  }

  return {
    geminiVoice:
      window.localStorage.getItem(STORAGE_KEYS.geminiVoice) || "Achird",
    personality:
      window.localStorage.getItem(STORAGE_KEYS.personality) || "companion",
  };
}

function forceGeminiOnly() {
  window.localStorage.setItem("nubo_voice_provider_v1", "gemini");
  window.localStorage.setItem("nubo_voice_provider_choice_v1", "gemini");
  window.localStorage.removeItem("nubo_openai_voice_v1");
}

export function NuboVoiceStudio() {
  const [profile, setProfile] = useState(() => readStoredProfile());
  const [status, setStatus] = useState("");

  useEffect(() => {
    forceGeminiOnly();
    setProfile(readStoredProfile());
  }, []);

  const currentLabel = useMemo(() => {
    const voice =
      GEMINI_VOICES.find((item) => item[0] === profile.geminiVoice)?.[1] ||
      profile.geminiVoice;
    const personality =
      PERSONALITIES.find((item) => item[0] === profile.personality)?.[1] ||
      profile.personality;
    return `Gemini Live／${voice}／${personality}`;
  }, [profile]);

  const apply = () => {
    window.localStorage.setItem(
      STORAGE_KEYS.geminiVoice,
      profile.geminiVoice,
    );
    window.localStorage.setItem(
      STORAGE_KEYS.personality,
      profile.personality,
    );
    forceGeminiOnly();
    setStatus("設定已儲存，正在重新啟動Gemini Live…");
    window.setTimeout(() => window.location.reload(), 350);
  };

  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <div className="provider-label">NUBO VOICE STUDIO</div>
          <strong>Gemini Live 聲線與個性</strong>
          <small>目前選擇：{currentLabel}</small>
        </div>
        <div className="provider-buttons">
          <button type="button" className="selected" disabled>
            Gemini Live
          </button>
        </div>
      </div>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>聲線</span>
          <select
            value={profile.geminiVoice}
            onChange={(event) =>
              setProfile((current) => ({
                ...current,
                geminiVoice: event.target.value,
              }))
            }
          >
            {GEMINI_VOICES.map(([id, label]) => (
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
                  setProfile((current) => ({
                    ...current,
                    personality: id,
                  }))
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
        <small>套用時會重新載入頁面；下一次啟動NUBO使用新的Gemini聲線與個性。</small>
      </div>
      {status ? <div className="status-note">{status}</div> : null}
    </section>
  );
}
