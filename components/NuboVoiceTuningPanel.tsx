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
  restartRequired?: boolean;
}> = [
  {
    key: "speed",
    label: "語速",
    description: "控制整體說話速度。",
    min: 0.85,
    max: 1.15,
    step: 0.01,
    suffix: "x",
    restartRequired: true,
  },
  {
    key: "cadence",
    label: "頓挫感",
    description: "控制重音、句尾收放、長短句與節奏變化。",
    min: 0,
    max: 100,
    step: 1,
    suffix: "%",
    restartRequired: true,
  },
  {
    key: "emotion",
    label: "情感",
    description: "控制溫柔、關心、驚喜與共感的表達強度。",
    min: 0,
    max: 100,
    step: 1,
    suffix: "%",
    restartRequired: true,
  },
  {
    key: "fillers",
    label: "語助詞",
    description: "控制「嗯、哦、啊，對、對耶」等自然口語頻率。",
    min: 0,
    max: 100,
    step: 1,
    suffix: "%",
    restartRequired: true,
  },
  {
    key: "relaxed",
    label: "慵懶感",
    description: "控制放鬆、柔軟與從容感，不等於拖慢或含糊。",
    min: 0,
    max: 100,
    step: 1,
    suffix: "%",
    restartRequired: true,
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
    description: "目前維持原生 Realtime 音軌，避免手機再次靜音。",
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
    <section className="nubo-voice-quick" aria-label="LEO LLM 聲線與語氣調音工作台">
      <div className="nubo-voice-quick-head">
        <div>
          <b>LEO LLM 聲線與語氣調音工作台</b>
          <small>調整數據後重新啟動 NUBO，實際比較語氣表現</small>
        </div>
        <span>V15.6.13</span>
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
              <small style={{ opacity: 0.7 }}>
                {control.description}
                {control.restartRequired ? " 下一次啟動語音時生效。" : ""}
              </small>
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
        建議先從：頓挫感 55%、情感 65%、語助詞 25%、慵懶感 20% 開始。過高可能變成刻意表演或拖腔。
      </p>
    </section>
  );
}
