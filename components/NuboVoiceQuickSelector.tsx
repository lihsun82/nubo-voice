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

type QuickMode = "female" | "male" | "realistic";

const QUICK_MODES: Array<{ id: QuickMode; label: string; note: string }> = [
  { id: "female", label: "女生語音", note: "溫柔、自然的真人管家聲線" },
  { id: "male", label: "男生語音", note: "沉穩、可靠的真人管家聲線" },
  { id: "realistic", label: "高擬真模式", note: "優先顯示高擬真與推薦聲線" },
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

export function NuboVoiceQuickSelector() {
  const [profile, setProfile] = useState<NuboVoiceProfile>(NUBO_DEFAULT_VOICE_PROFILE);
  const [mode, setMode] = useState<QuickMode>("female");

  useEffect(() => {
    const current = readNuboVoiceProfile();
    setProfile(current);
    const all = current.engine === "openai" ? NUBO_OPENAI_VOICES : NUBO_GEMINI_VOICES;
    const selected = all.find((voice) => voice.id === current.voice) as
      | NuboVoiceOption
      | undefined;

    if (isRecommendedVoice(selected) || isHighRealismVoice(selected)) {
      setMode("realistic");
    } else if (selected?.gender === "male") {
      setMode("male");
    } else {
      setMode("female");
    }
  }, []);

  const voices = useMemo<ReadonlyArray<NuboVoiceOption>>(() => {
    const all = (
      profile.engine === "openai" ? NUBO_OPENAI_VOICES : NUBO_GEMINI_VOICES
    ) as ReadonlyArray<NuboVoiceOption>;

    if (mode === "realistic") {
      const preferred = all.filter(
        (voice) => isRecommendedVoice(voice) || isHighRealismVoice(voice),
      );
      return preferred.length ? preferred : all;
    }

    return all.filter((voice) => voice.gender === (mode as NuboVoiceGender));
  }, [mode, profile.engine]);

  const selectVoice = (voice: NuboVoiceOption) => {
    const next = { ...profile, voice: voice.id } as NuboVoiceProfile;
    setProfile(next);
    saveNuboVoiceProfile(next);
  };

  return (
    <section className="nubo-voice-quick" aria-label="快速選擇NUBO語音">
      <div className="nubo-voice-quick-head">
        <div>
          <b>選擇 NUBO 真人管家語音</b>
          <small>所有聲線都套用溫柔、冷靜、可靠的說話方式</small>
        </div>
        <span>V15.6</span>
      </div>

      <div className="nubo-voice-quick-modes" role="tablist" aria-label="語音類型">
        {QUICK_MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={mode === item.id}
            className={mode === item.id ? "active" : ""}
            onClick={() => setMode(item.id)}
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
                {selected
                  ? "已選擇"
                  : isHighRealismVoice(voice) || isRecommendedVoice(voice)
                    ? "高擬真"
                    : voice.genderLabel}
              </em>
            </button>
          );
        })}
      </div>
      <p>切換後，結束目前對話並重新啟動 NUBO，即會套用新聲音與 V15.6 語氣。</p>
    </section>
  );
}
