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
  description: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
}> = [
  {
    key: "speed",
    label: "語速",
    description: "LEO LLM 會在目前回答結束後即時套用；Gemini 需快速續接。",
    min: 0.85,
    max: 1.15,
    step: 0.01,
    suffix: "x",
  },
  {
    key: "perceivedPitch",
    label: "聲線高低／感知音高",
    description: "往右更輕亮、年輕；往左更低沉、成熟。LEO LLM 從下一句即時生效。",
    min: -30,
    max: 30,
    step: 1,
    suffix: "",
  },
  {
    key: "cadence",
    label: "頓挫感",
    description: "控制重音、句尾收放、長短句與節奏變化；LEO LLM 從下一句即時生效。",
    min: 0,
    max: 100,
    step: 1,
    suffix: "%",
  },
  {
    key: "emotion",
    label: "情感",
    description: "控制溫柔、關心、驚喜、黏人與撒嬌感；LEO LLM 從下一句即時生效。",
    min: 0,
    max: 100,
    step: 1,
    suffix: "%",
  },
  {
    key: "fillers",
    label: "語助詞",
    description: "控制「好啊、好咩、嗯、嗯…、哦、好啦」等口語頻率與拖尾強度；可更甜、更黏、更撒嬌。",
    min: 0,
    max: 100,
    step: 1,
    suffix: "%",
  },
  {
    key: "relaxed",
    label: "慵懶感",
    description: "控制放鬆、柔軟、黏人與語尾延伸；一般聊天允許較明顯拖尾。",
    min: 0,
    max: 100,
    step: 1,
    suffix: "%",
  },
  {
    key: "brightness",
    label: "明亮度",
    description: "Android 安全模式暫不套用即時 EQ，數據仍會保存。",
    min: -8,
    max: 8,
    step: 0.5,
    suffix: " dB",
  },
  {
    key: "warmth",
    label: "溫暖度／厚度",
    description: "Android 安全模式暫不套用即時 EQ，數據仍會保存。",
    min: -8,
    max: 8,
    step: 0.5,
    suffix: " dB",
  },
  {
    key: "presence",
    label: "清晰度／存在感",
    description: "Android 安全模式暫不套用即時 EQ，數據仍會保存。",
    min: -8,
    max: 8,
    step: 0.5,
    suffix: " dB",
  },
  {
    key: "compression",
    label: "動態壓縮",
    description: "Android 安全模式暫不套用即時壓縮，數據仍會保存。",
    min: 0,
    max: 100,
    step: 1,
    suffix: "%",
  },
  {
    key: "outputGain",
    label: "輸出音量",
    description: "目前維持原生語音音軌，避免手機再次靜音。",
    min: 0.7,
    max: 1.3,
    step: 0.01,
    suffix: "x",
  },
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
    <section className="nubo-voice-quick" aria-label="NUBO 邊聊邊調語音工作台">
      <div className="nubo-voice-quick-head">
        <div>
          <b>NUBO 邊聊邊調聲線與語氣工作台</b>
          <small>LEO LLM 拉動滑桿後，從下一句開始立即套用，不必結束對話</small>
        </div>
        <span>V15.6.20</span>
      </div>

      <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
        {CONTROLS.map((control) => {
          const value = tuning[control.key];
          return (
            <label key={control.key} style={{ display: "grid", gap: 6 }}>
              <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>{control.label}</strong>
                <em style={{ fontStyle: "normal", opacity: 0.85 }}>
                  {Number(value).toFixed(control.step < 0.1 ? 2 : control.step < 1 ? 1 : 0)}
                  {control.suffix}
                </em>
              </span>
              <small style={{ opacity: 0.7 }}>{control.description}</small>
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
          {saved ? "已儲存目前數據" : "儲存目前數據"}
        </button>
        <button className="secondary" type="button" onClick={reset}>
          恢復 V15.6.20 預設
        </button>
      </div>

      <p>
        V15.6.20：語助詞拖尾不再限制短促，可更甜、更黏、稍微油膩並明顯撒嬌；「哦」微升音高，「好啦」的「啦」可降低音高並拉長。新設定從下一句開始生效。
      </p>
    </section>
  );
}
