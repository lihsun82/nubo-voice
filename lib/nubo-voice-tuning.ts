export const NUBO_VOICE_TUNING_STORAGE_KEY = "nubo_voice_tuning_v1";
export const NUBO_VOICE_TUNING_EVENT = "nubo:voice-tuning-change";

export type NuboVoiceTuning = {
  speed: number;
  brightness: number;
  warmth: number;
  presence: number;
  compression: number;
  outputGain: number;
  cadence: number;
  emotion: number;
  fillers: number;
  relaxed: number;
  perceivedPitch: number;
};

export const NUBO_DEFAULT_VOICE_TUNING: NuboVoiceTuning = {
  speed: 1,
  brightness: 2,
  warmth: -2,
  presence: 2,
  compression: 35,
  outputGain: 1,
  cadence: 45,
  emotion: 55,
  fillers: 25,
  relaxed: 20,
  perceivedPitch: 10,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeNuboVoiceTuning(
  value: Partial<NuboVoiceTuning> | null | undefined,
): NuboVoiceTuning {
  return {
    speed: clamp(Number(value?.speed ?? 1), 0.85, 1.15),
    brightness: clamp(Number(value?.brightness ?? 2), -8, 8),
    warmth: clamp(Number(value?.warmth ?? -2), -8, 8),
    presence: clamp(Number(value?.presence ?? 2), -8, 8),
    compression: clamp(Number(value?.compression ?? 35), 0, 100),
    outputGain: clamp(Number(value?.outputGain ?? 1), 0.7, 1.3),
    cadence: clamp(Number(value?.cadence ?? 45), 0, 100),
    emotion: clamp(Number(value?.emotion ?? 55), 0, 100),
    fillers: clamp(Number(value?.fillers ?? 25), 0, 100),
    relaxed: clamp(Number(value?.relaxed ?? 20), 0, 100),
    perceivedPitch: clamp(Number(value?.perceivedPitch ?? 10), -30, 30),
  };
}

function intensity(value: number, low: string, medium: string, high: string) {
  if (value < 34) return low;
  if (value < 67) return medium;
  return high;
}

function pitchInstruction(value: number) {
  if (value <= -20) {
    return "聲線感明顯偏低、偏厚、偏成熟，但不要壓喉、沙啞或故意裝低沉。";
  }
  if (value < -5) {
    return "聲線感稍微偏低、偏穩，保留自然女性音色，不要變得老成。";
  }
  if (value <= 5) {
    return "維持原始自然音高，不刻意提高或降低。";
  }
  if (value < 20) {
    return "聲線感稍微提高，變得更輕亮、更年輕，但不要娃娃音或尖銳。";
  }
  return "聲線感明顯提高，呈現更青春、輕亮的年輕女性感；保持自然共鳴，禁止娃娃音、卡通腔、尖銳或假聲。";
}

export function buildNuboVoicePerformanceInstruction(tuning: NuboVoiceTuning) {
  const cadence = intensity(
    tuning.cadence,
    "節奏平順自然，避免刻意加重音或戲劇化斷句。",
    "說話要有適度頓挫，重點字自然加重，句尾有收放，長短句交替。",
    "頓挫感明顯但仍像真人：重點清楚、節奏有變化、適度停頓，不可像舞台朗誦。",
  );
  const emotion = intensity(
    tuning.emotion,
    "情緒表達克制，保持自然親切。",
    "依內容帶出溫柔、關心、驚喜或認真等自然情緒，不要整段同一表情。",
    "情感反應鮮明、有共感，但不可誇張、哭腔、演戲或犧牲資訊準確度。",
  );
  const fillers = intensity(
    tuning.fillers,
    "幾乎不使用語助詞，除非口語情境非常自然。",
    "偶爾自然使用「嗯」「哦」「啊，對」「對耶」等語助詞，但不要每句都加。",
    "可以較常使用自然語助詞與短反應，但必須分散、符合情境，禁止固定口頭禪或連續堆疊。",
  );
  const relaxed = intensity(
    tuning.relaxed,
    "保持清爽俐落，不刻意拉長語尾。",
    "帶一點放鬆慵懶感，語尾柔和、節奏從容，但不要拖字或沒精神。",
    "呈現明顯但舒服的慵懶感：放鬆、柔軟、從容，仍須咬字清楚且反應可靠，不可含糊或昏沉。",
  );
  const pitch = pitchInstruction(tuning.perceivedPitch);

  return `LEO LLM 動態語氣調音：\n- ${pitch}\n- ${cadence}\n- ${emotion}\n- ${fillers}\n- ${relaxed}\n- 感知音高數值為 ${tuning.perceivedPitch}，只調整聽感與表達，不使用數位變調，不改變播放速度。\n- 以上參數只調整表達方式，不得改變事實、身份、安全規則或工具使用準確度。`;
}

export function readNuboVoiceTuning(): NuboVoiceTuning {
  if (typeof window === "undefined") return NUBO_DEFAULT_VOICE_TUNING;

  try {
    const raw = window.localStorage.getItem(NUBO_VOICE_TUNING_STORAGE_KEY);
    return normalizeNuboVoiceTuning(raw ? JSON.parse(raw) : null);
  } catch {
    return NUBO_DEFAULT_VOICE_TUNING;
  }
}

export function saveNuboVoiceTuning(value: NuboVoiceTuning) {
  if (typeof window === "undefined") return;
  const normalized = normalizeNuboVoiceTuning(value);
  window.localStorage.setItem(
    NUBO_VOICE_TUNING_STORAGE_KEY,
    JSON.stringify(normalized),
  );
  window.dispatchEvent(
    new CustomEvent<NuboVoiceTuning>(NUBO_VOICE_TUNING_EVENT, {
      detail: normalized,
    }),
  );
}
