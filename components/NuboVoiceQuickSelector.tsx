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

const LEO_REALTIME_VOICE_IDS = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

const QUICK_MODES: Array<{ id: QuickMode; label: string; note: string }> = [
  { id: "female", label: "女生語音", note: "溫柔、自然的真人管家聲線" },
  { id: "male", label: "男生語音", note: "沉穩、可靠的真人管家聲線" },
  {
    id: "openai",
    label: "LEO LLM 聲線調音",
    note: "10 種 Realtime 聲線＋可調式音色工作台",
  },
];

function openAiVoiceBadge(voice: NuboVoiceOption, selected: boolean) {
  if (selected) return "已選擇";
  if (voice.id === "shimmer") return "預設";
  return "點選試聽";
}

export function NuboVoiceQuickSelector() {
  const [profile, setProfile] = useState<NuboVoiceProfile>(NUBO_DEFAULT_VOICE_PROFILE);
  const [mode, setMode] = useState<QuickMode>("female");

  useEffect(() => {
    const current = readNuboVoiceProfile();
    const migrated =
      current.engine === "openai" && !LEO_REALTIME_VOICE_IDS.has(current.voice)
        ? ({ ...current, voice: "shimmer" } as NuboVoiceProfile)
        : current;

    if (migrated !== current) saveNuboVoiceProfile(migrated);
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
      const order = [
        "shimmer",
        "verse",
        "alloy",
        "coral",
        "ash",
        "ballad",
        "echo",
        "sage",
        "marin",
        "cedar",
      ];
      return all
        .filter((voice) => LEO_REALTIME_VOICE_IDS.has(voice.id))
        .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
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
        voice: LEO_REALTIME_VOICE_IDS.has(profile.voice) ? profile.voice : "shimmer",
        personality: "professional",
      } as NuboVoiceProfile;
      setProfile(next);
      saveNuboVoiceProfile(next);
    }
  };

  const selectVoice = (voice: NuboVoiceOption) => {
    const next = {
      ...profile,
      engine: mode === "openai" ? "openai" : "gemini",
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
          <small>先選底層聲線，再用下方調音台調整亮度、厚度與清晰度</small>
        </div>
        <span>V15.6.12</span>
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
        Realtime 聲線開始輸出後不能在同一個工作階段更換；點選另一個聲線時，NUBO 會完整重建語音連線。
      </p>
    </section>
  );
}
