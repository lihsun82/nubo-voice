"use client";

import { useEffect, useState } from "react";
import {
  NUBO_DEFAULT_VOICE_TUNING,
  readNuboVoiceTuning,
  saveNuboVoiceTuning,
  type NuboVoiceTuning,
} from "@/lib/nubo-voice-tuning";

const CONTROLS: Array<{
  key: keyof NuboVoiceTuning;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
}> = [
  { key: "speed", label: "語速", min: 0.85, max: 1.15, step: 0.01, suffix: "x" },
  { key: "brightness", label: "明亮度", min: -8, max: 8, step: 0.5, suffix: " dB" },
  { key: "warmth", label: "溫暖度／厚度", min: -8, max: 8, step: 0.5, suffix: " dB" },
  { key: "presence", label: "清晰度／存在感", min: -8, max: 8, step: 0.5, suffix: " dB" },
  { key: "compression", label: "動態壓縮", min: 0, max: 100, step: 1, suffix: "%" },
  { key: "outputGain", label: "輸出音量", min: 0.7, max: 1.3, step: 0.01, suffix: "x" },
];

export function NuboVoiceTuningPanel() {
  const [tuning, setTuning] = useState<NuboVoiceTuning>(NUBO_DEFAULT_VOICE_TUNING);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTuning(readNuboVoiceTuning());
  }, []);

  const update = (key: keyof NuboVoiceTuning, value: number) => {
    const next = { ...tuning, [key]: value };
    setTuning(next);
    saveNuboVoiceTuning(next);
    setSaved(false);
  };

  const reset = () => {
    setTuning(NUBO_DEFAULT_VOICE_TUNING);
    saveNuboVoiceTuning(NUBO_DEFAULT_VOICE_TUNING);
    setSaved(false);
  };

  const save = () => {
    saveNuboVoiceTuning(tuning);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <section className="nubo-voice-quick" aria-label="LEO LLM 聲線調音工作台">
      <div className="nubo-voice-quick-head">
        <div>
          <b>LEO LLM 聲線調音工作台</b>
          <small>先實際調整，找到喜歡的數據後再固定成正式聲線</small>
        </div>
        <span>V15.6.12</span>
      </div>

      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        {CONTROLS.map((control) => {
          const value = tuning[control.key];
          return (
            <label key={control.key} style={{ display: "grid", gap: 6 }}>
              <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>{control.label}</strong>
                <em style={{ fontStyle: "normal", opacity: 0.8 }}>
                  {Number(value).toFixed(control.step < 0.1 ? 2 : 1)}{control.suffix}
                </em>
              </span>
              <input
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={value}
                onChange={(event) => update(control.key, Number(event.target.value))}
              />
            </label>
          );
        })}
      </div>

      <div className="actions" style={{ marginTop: 16 }}>
        <button className="primary" type="button" onClick={save}>
          {saved ? "已儲存數據" : "儲存目前數據"}
        </button>
        <button className="secondary" type="button" onClick={reset}>
          恢復預設
        </button>
      </div>

      <p>
        明亮度、溫暖度、清晰度、壓縮與音量可即時套用；語速會在下一次啟動或切換聲線時生效。
      </p>
    </section>
  );
}
