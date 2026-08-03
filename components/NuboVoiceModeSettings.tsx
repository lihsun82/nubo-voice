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
  type NuboVoiceGender,
  type NuboVoiceName,
  type NuboVoiceOption,
  type NuboVoiceProfile,
  getNuboProfileLabel,
  readNuboVoiceProfile,
  saveNuboVoiceProfile,
} from "@/lib/nubo-voice-profile";

type VoiceFilter = "all" | NuboVoiceGender | "recommended";

const GENDER_FILTERS: Array<{
  id: VoiceFilter;
  label: string;
}> = [
  { id: "all", label: "全部" },
  { id: "male", label: "男聲" },
  { id: "female", label: "女聲" },
  { id: "neutral", label: "中性" },
  { id: "recommended", label: "擬真推薦" },
];

export default function NuboVoiceModeSettings() {
  const [profile, setProfile] = useState<NuboVoiceProfile>(
    NUBO_DEFAULT_VOICE_PROFILE,
  );
  const [voiceFilter, setVoiceFilter] = useState<VoiceFilter>("all");
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    setProfile(readNuboVoiceProfile());
  }, []);

  const voiceOptions: ReadonlyArray<NuboVoiceOption> =
    profile.engine === "openai" ? NUBO_OPENAI_VOICES : NUBO_GEMINI_VOICES;

  const availableFilters = useMemo(() => {
    if (profile.engine === "gemini") {
      return GENDER_FILTERS.filter(
        (filter) =>
          filter.id === "all" ||
          filter.id === "male" ||
          filter.id === "female",
      );
    }
    return GENDER_FILTERS;
  }, [profile.engine]);

  const visibleVoiceOptions = useMemo(() => {
    if (voiceFilter === "all") return voiceOptions;
    if (voiceFilter === "recommended") {
      return voiceOptions.filter((voice) => voice.recommended);
    }
    return voiceOptions.filter((voice) => voice.gender === voiceFilter);
  }, [voiceFilter, voiceOptions]);

  const labels = useMemo(() => getNuboProfileLabel(profile), [profile]);

  const commit = (next: NuboVoiceProfile) => {
    setProfile(next);
    saveNuboVoiceProfile(next);
    setSavedAt(Date.now());
  };

  const chooseEngine = (engine: NuboVoiceEngine) => {
    const voice: NuboVoiceName = engine === "openai" ? "marin" : "Achird";
    setVoiceFilter("all");
    commit({ ...profile, engine, voice });
  };

  return (
    <section
      className="nubo-panel nubo-full-panel nubo-voice-settings"
      data-nubo-voice-settings="true"
    >
      <div className="nubo-panel-head">
        <div>
          <h2>NUBO 語音模式與聲音庫</h2>
          <p>
            AINUBO Hotel 智慧旅宿管家，已啟用台灣飯店營業日與報價日期校正。
          </p>
        </div>
        <span>AINUBO Hotel V15.4</span>
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
              onClick={() => {
                setVoiceFilter("all");
                commit(preset.profile);
              }}
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
        <div className="nubo-voice-legend-row">
          <legend>聲音選擇</legend>
          <small>
            {profile.engine === "gemini"
              ? "30 種官方男女聲"
              : "10 種高擬真聲線"}
          </small>
        </div>

        <div className="nubo-voice-filter" role="group" aria-label="聲音篩選">
          {availableFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={voiceFilter === filter.id ? "active" : ""}
              onClick={() => setVoiceFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="nubo-voice-gallery" aria-label="可選聲音">
          <div
            className="nubo-choice-grid"
            role="radiogroup"
            aria-label="NUBO 聲音選項"
          >
            {visibleVoiceOptions.map((option) => {
              const selected = profile.voice === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`選擇${option.label}，${option.genderLabel}，${option.tone}`}
                  className={`nubo-choice-card nubo-voice-card${selected ? " active" : ""}`}
                  onClick={() => commit({ ...profile, voice: option.id })}
                >
                  <div className="nubo-voice-badges">
                    <span>{option.genderLabel}</span>
                    {option.recommended ? <em>官方品質推薦</em> : null}
                    {option.realism === "high" ? <i>高擬真</i> : null}
                    {selected ? <b>✓ 已選擇</b> : null}
                  </div>
                  <strong>{option.label}</strong>
                  <small>{option.tone}</small>
                </button>
              );
            })}
          </div>
        </div>

        <p className="nubo-voice-result-count">
          顯示 {visibleVoiceOptions.length} 種聲音｜點擊整張卡片即可選擇
        </p>
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
          <span>
            {labels.engine}｜{labels.voice}｜{labels.personality}
          </span>
        </div>
        <small>
          {savedAt
            ? `已選擇「${labels.voice}」。正在對話中的語音工作階段會在重新連線後套用。`
            : "設定儲存在這支裝置，不會寫入公開頁面。"}
        </small>
      </div>

      <div className="nubo-mode-note">
        <b>男女聲與擬真聲線說明</b>
        <p>
          Gemini 的男聲／女聲依官方聲音資料標示。OpenAI Realtime 官方不以性別命名，介面中的「偏男聲／偏女聲／中性聲線」是方便選擇的聲線聽感分類；Marin 與 Cedar 標示為官方品質推薦。
        </p>
      </div>
    </section>
  );
}
