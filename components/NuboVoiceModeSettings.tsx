"use client";

import { useEffect, useMemo, useState } from "react";
import {
  NUBO_DEFAULT_VOICE_PROFILE,
  NUBO_ENGINE_OPTIONS,
  NUBO_GEMINI_VOICES,
  NUBO_MODE_PRESETS,
  NUBO_OPENAI_VOICES,
  NUBO_PERSONALITY_OPTIONS,
  type NuboVoiceEngine,
  type NuboVoiceName,
  type NuboVoiceProfile,
  getNuboProfileLabel,
  readNuboVoiceProfile,
  saveNuboVoiceProfile,
} from "@/lib/nubo-voice-profile";

export default function NuboVoiceModeSettings() {
  const [profile, setProfile] = useState<NuboVoiceProfile>(
    NUBO_DEFAULT_VOICE_PROFILE,
  );
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    setProfile(readNuboVoiceProfile());
  }, []);

  const voiceOptions =
    profile.engine === "openai" ? NUBO_OPENAI_VOICES : NUBO_GEMINI_VOICES;
  const labels = useMemo(() => getNuboProfileLabel(profile), [profile]);

  const commit = (next: NuboVoiceProfile) => {
    setProfile(next);
    saveNuboVoiceProfile(next);
    setSavedAt(Date.now());
  };

  const chooseEngine = (engine: NuboVoiceEngine) => {
    const voice: NuboVoiceName = engine === "openai" ? "marin" : "Achird";
    commit({ ...profile, engine, voice });
  };

  return (
    <section
      className="nubo-panel nubo-full-panel nubo-voice-settings"
      data-nubo-voice-settings="true"
    >
      <div className="nubo-panel-head">
        <div>
          <h2>NUBO 語音模式</h2>
          <p>選擇引擎、聲音與個性。設定會在下一次啟動或重新連線時套用。</p>
        </div>
        <span>Voice Modes V15</span>
      </div>

      <div className="nubo-mode-presets" aria-label="快速模式">
        {NUBO_MODE_PRESETS.map((preset) => {
          const active =
            preset.profile.engine === profile.engine &&
            preset.profile.voice === profile.voice &&
            preset.profile.personality === profile.personality;

          return (
            <button
              key={preset.id}
              type="button"
              className={`nubo-mode-card${active ? " active" : ""}`}
              onClick={() => commit(preset.profile)}
            >
              <strong>{preset.title}</strong>
              <span>{preset.subtitle}</span>
              <small>{preset.description}</small>
            </button>
          );
        })}
      </div>

      <fieldset className="nubo-voice-fieldset">
        <legend>語音引擎</legend>
        <div className="nubo-choice-grid two-column">
          {NUBO_ENGINE_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={`nubo-choice-card${profile.engine === option.id ? " active" : ""}`}
            >
              <input
                type="radio"
                name="nubo-engine"
                checked={profile.engine === option.id}
                onChange={() => chooseEngine(option.id)}
              />
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="nubo-voice-fieldset">
        <legend>聲音</legend>
        <div className="nubo-choice-grid">
          {voiceOptions.map((option) => (
            <label
              key={option.id}
              className={`nubo-choice-card${profile.voice === option.id ? " active" : ""}`}
            >
              <input
                type="radio"
                name="nubo-voice"
                checked={profile.voice === option.id}
                onChange={() => commit({ ...profile, voice: option.id })}
              />
              <strong>{option.label}</strong>
              <small>{option.tone}</small>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="nubo-voice-fieldset">
        <legend>個性</legend>
        <div className="nubo-choice-grid two-column">
          {NUBO_PERSONALITY_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={`nubo-choice-card${profile.personality === option.id ? " active" : ""}`}
            >
              <input
                type="radio"
                name="nubo-personality"
                checked={profile.personality === option.id}
                onChange={() => commit({ ...profile, personality: option.id })}
              />
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="nubo-current-profile" aria-live="polite">
        <div>
          <b>目前設定</b>
          <span>{labels.engine}｜{labels.voice}｜{labels.personality}</span>
        </div>
        <small>
          {savedAt
            ? "已儲存。正在對話時請結束後重新啟動 NUBO。"
            : "設定儲存在這支裝置，不會寫入公開頁面。"}
        </small>
      </div>

      <div className="nubo-mode-note">
        <b>高擬人模式說明</b>
        <p>
          目前使用 API 已開放的 Realtime 語音方案搭配 Marin／Cedar。ChatGPT
          的 GPT-Live 語音尚未正式開放 API，因此不會顯示成可選引擎。
        </p>
      </div>
    </section>
  );
}
