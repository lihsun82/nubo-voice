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
    label: "LEO LLM 年輕輕快台灣女聲",
    note: "Shimmer 主聲線・明亮有活力・自然台灣口吻",
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
  if (voice.id === "shimmer") return "主聲線";
  if (voice.id === "coral") return "備援女聲";
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
      current.engine === "openai" &&
      (current.voice === "marin" || current.voice === "coral")
        ? ({ ...current, voice: "shimmer" } as NuboVoiceProfile)
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
          voice.id === "shimmer" ? 0 : voice.id === "coral" ? 1 : 2;
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
        voice: "shimmer",
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
          <small>LEO LLM 以年輕、明亮、有活力又自然的台灣口吻為主</small>
        </div>
        <span>V15.6.6</span>
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
        Shimmer 為主聲線，Coral 為備援。新版強化年輕亮度、活力與台灣口吻，同時把語速維持在自然範圍。
      </p>
    </section>
  );
}
