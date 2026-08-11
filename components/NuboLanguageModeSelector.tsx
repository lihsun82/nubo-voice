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
          <b>NUBO 語言與腔口模式</b>
          <small>中文鎖定母語級臺灣標準國語；明確指定外語時直接切換，不做二次確認</small>
        </div>
        <span>V22</span>
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
        語言模式從下一句即時生效。中文固定使用臺灣母語者國語腔；若直接說「改用阿拉伯語」「接下來說芬蘭語」等明確指令，NUBO 會立即切換，不另外做最後語言確認。
      </p>
    </section>
  );
}
