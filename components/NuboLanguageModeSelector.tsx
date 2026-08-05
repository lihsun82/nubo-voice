"use client";

import { useEffect, useState } from "react";
import {
  NUBO_DEFAULT_LANGUAGE_MODE,
  NUBO_LANGUAGE_OPTIONS,
  readNuboLanguageMode,
  saveNuboLanguageMode,
  type NuboLanguageMode,
} from "@/lib/nubo-language-mode";

export function NuboLanguageModeSelector() {
  const [mode, setMode] = useState<NuboLanguageMode>(NUBO_DEFAULT_LANGUAGE_MODE);

  useEffect(() => {
    setMode(readNuboLanguageMode());
  }, []);

  const choose = (nextMode: NuboLanguageMode) => {
    setMode(nextMode);
    saveNuboLanguageMode(nextMode);
  };

  return (
    <section className="nubo-voice-quick" aria-label="NUBO 語言模式">
      <div className="nubo-voice-quick-head">
        <div>
          <b>NUBO 臺灣語言模式</b>
          <small>臺灣台語強化：先用台語思考，再自然說出台灣人真正會用的句型</small>
        </div>
        <span>V15.6.22</span>
      </div>

      <div className="nubo-voice-quick-modes" role="radiogroup" aria-label="語言模式">
        {NUBO_LANGUAGE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={mode === option.id}
            className={mode === option.id ? "active" : ""}
            onClick={() => choose(option.id)}
          >
            <strong>{option.label}</strong>
            <small>{option.note}</small>
          </button>
        ))}
      </div>

      <p>
        更換語言模式後，LEO LLM 從下一句即時生效；Gemini 會在下一次語音續接時完整套用。臺灣台語模式會避免華語逐字翻譯與其他地區閩南語腔調。
      </p>
    </section>
  );
}
