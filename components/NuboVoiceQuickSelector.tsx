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

const LEO_TRIAL_VOICE_IDS = new Set(["shimmer", "verse", "alloy", "coral"]);

const QUICK_MODES: Array<{ id: QuickMode; label: string; note: string }> = [
  { id: "female", label: "女生語音", note: "溫柔、自然的真人管家聲線" },
  { id: "male", label: "男生語音", note: "沉穩、可靠的真人管家聲線" },
  {
    id: "openai",
    label: "LEO LLM 年輕聲線試聽",
    note: "Shimmer・Verse・Alloy・Coral 四種即時比較",
  },
];

function openAiVoiceBadge(voice: NuboVoiceOption, selected: boolean) {
  if (selected) return "已選擇";
  if (voice.id === "shimmer") return "預設年輕聲線";
  return "點選試聽";
}

export function NuboVoiceQuickSelector() {
  const [profile, setProfile] = useState<NuboVoiceProfile>(NUBO_DEFAULT_VOICE_PROFILE);
  const [mode, setMode] = useState<QuickMode>("female");

  useEffect(() => {
    const current = readNuboVoiceProfile();
    const migrated =
      current.engine === "openai" && !LEO_TRIAL_VOICE_IDS.has(current.voice)
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
      const all = NUBO_OPENAI_VOICES as ReadonlyArray<NuboVoiceOption>;
      return all
        .filter((voice) => LEO_TRIAL_VOICE_IDS.has(voice.id))
        .sort((a, b) => {
          const order = ["shimmer", "verse", "alloy", "coral"];
          return order.indexOf(a.id) - order.indexOf(b.id);
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
        voice: LEO_TRIAL_VOICE_IDS.has(profile.voice) ? profile.voice : "shimmer",
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
          <small>切換聲線後會完整重建語音工作階段，實際比較年齡感</small>
        </div>
        <span>V15.6.11</span>
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
        預設 Shimmer，語速 1.0。可直接比較 Verse、Alloy、Coral；若 Railway 已設定自訂聲線 ID，則自訂聲線會優先套用。
      </p>
    </section>
  );
}
