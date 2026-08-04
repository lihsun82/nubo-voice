"use client";

import { useEffect, useMemo, useState } from "react";
import {
  NUBO_DEFAULT_VOICE_PROFILE,
  NUBO_OPENAI_VOICES,
  NUBO_GEMINI_VOICES,
  readNuboVoiceProfile,
  saveNuboVoiceProfile,
  type NuboVoiceGender,
  type NuboVoiceOption,
  type NuboVoiceProfile,
} from "@/lib/nubo-voice-profile";

type QuickMode = "female" | "male" | "openai";

const QUICK_MODES: Array<{ id: QuickMode; label: string; note: string }> = [
  { id: "female", label: "女生語音", note: "溫柔、自然的真人管家聲線" },
  { id: "male", label: "男生語音", note: "沉穩、可靠的真人管家聲線" },
  {
    id: "openai",
    label: "LEO LLM 溫柔真人管家",
    note: "Coral 主聲線・Shimmer 備援・自然停頓與稍慢語速",
  },
];

function isRecommendedVoice(voice: NuboVoiceOption | undefined) {
  return Boolean(
    voice &&
      "recommended" in voice &&
      voice.recommended === true,
  );
}

function isHighRealismVoice(voice: NuboVoiceOption | undefined) {
  return voice?.realism === "high";
}

function openAiVoiceBadge(voice: NuboVoiceOption, selected: boolean) {
  if (selected) return "已選擇";
  if (voice.id === "coral") return "主聲線";
  if (voice.id === "shimmer") return "備援女聲";
  return isHighRealismVoice(voice) || isRecommendedVoice(voice)
    ? "高擬真"
    : voice.genderLabel;
}

export function NuboVoiceQuickSelector() {
  const [profile, setProfile] = useState<NuboVoiceProfile>(NUBO_DEFAULT_VOICE_PROFILE);
  const [mode, setMode] = useState<QuickMode>("female");

  useEffect(() => {
    const current = readNuboVoiceProfile();
    const migrated =
      current.engine === "openai" && current.voice === "marin"
        ? ({ ...current, voice: "coral" } as NuboVoiceProfile)
        : current;

    if (migrated !== current) {
      saveNuboVoiceProfile(migrated);
    }

    setProfile(migrated);

    if (migrated.engine === "openai") {
      setMode("openai");
      return;
    }

    const selected = NUBO_GEMINI_VOICES.find(
      (voice) => voice.id === migrated.voice,
    ) as NuboVoiceOption | undefined;

    setMode(selected?.gender === "male" ? "male" : "female");
  }, []);

  const voices = useMemo<ReadonlyArray<NuboVoiceOption>>(() => {
    if (mode === "openai") {
      const all = (NUBO_OPENAI_VOICES as ReadonlyArray<NuboVoiceOption>).filter(
        (voice) => voice.id !== "marin",
      );
      return [...all].sort((a, b) => {
        const priority = (voice: NuboVoiceOption) =>
          voice.id === "coral" ? 0 : voice.id === "shimmer" ? 1 : 2;
        return priority(a) - priority(b);
      });
    }

    const all = NUBO_GEMINI_VOICES as ReadonlyArray<NuboVoiceOption>;
    return all.filter((voice) => voice.gender === (mode as NuboVoiceGender));
  }, [mode]);

  const chooseMode = (nextMode: QuickMode) => {
    setMode(nextMode);

    if (nextMode === "openai") {
      const next = {
        ...profile,
        engine: "openai",
        voice: "coral",
        personality: "professional",
      } as NuboVoiceProfile;
      setProfile(next);
      saveNuboVoiceProfile(next);
    }
  };

  const selectVoice = (voice: NuboVoiceOption) => {
    const engine = mode === "openai" ? "openai" : "gemini";
    const next = {
      ...profile,
      engine,
      voice: voice.id,
    } as NuboVoiceProfile;

    setProfile(next);
    saveNuboVoiceProfile(next);
  };

  return (
    <section className="nubo-voice-quick" aria-label="快速選擇NUBO語音">
      <div className="nubo-voice-quick-head">
        <div>
          <b>選擇 NUBO 真人管家語音</b>
          <small>LEO LLM 以自然、簡潔、有判斷力的真人對話為主</small>
        </div>
        <span>V15.6.3</span>
      </div>

      <div className="nubo-voice-quick-modes" role="tablist" aria-label="語音類型">
        {QUICK_MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            className={mode === item.id ? "active" : ""}
            onClick={() => chooseMode(item.id)}
          >
            <strong>{item.label}</strong>
            <small>{item.note}</small>
          </button>
        ))}
      </div>

      <div className="nubo-voice-quick-list" role="radiogroup" aria-label="可選擬真聲線">
        {voices.map((voice) => {
          const selected = profile.voice === voice.id;
          return (
            <button
              key={voice.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={selected ? "selected" : ""}
              onClick={() => selectVoice(voice)}
            >
              <span>
                <strong>{voice.label}</strong>
                <small>{voice.tone}</small>
              </span>
              <em>
                {mode === "openai"
                  ? openAiVoiceBadge(voice, selected)
                  : selected
                    ? "已選擇"
                    : voice.genderLabel}
              </em>
            </button>
          );
        })}
      </div>

      <p>
        Coral 是 LEO LLM 的主要女聲；Shimmer 是 Realtime 可用的備援女聲。Nova 僅用於文字轉語音，不會放進即時對話模式。
      </p>
    </section>
  );
}
