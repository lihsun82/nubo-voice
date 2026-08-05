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
  speed: 0.99,
  brightness: 2,
  warmth: -2,
  presence: 2,
  compression: 35,
  outputGain: 1,
  cadence: 45,
  emotion: 67,
  fillers: 87,
  relaxed: 36,
  perceivedPitch: 10,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeNuboVoiceTuning(
  value: Partial<NuboVoiceTuning> | null | undefined,
): NuboVoiceTuning {
  return {
    speed: clamp(Number(value?.speed ?? 0.99), 0.85, 1.15),
    brightness: clamp(Number(value?.brightness ?? 2), -8, 8),
    warmth: clamp(Number(value?.warmth ?? -2), -8, 8),
    presence: clamp(Number(value?.presence ?? 2), -8, 8),
    compression: clamp(Number(value?.compression ?? 35), 0, 100),
    outputGain: clamp(Number(value?.outputGain ?? 1), 0.7, 1.3),
    cadence: clamp(Number(value?.cadence ?? 45), 0, 100),
    emotion: clamp(Number(value?.emotion ?? 67), 0, 100),
    fillers: clamp(Number(value?.fillers ?? 87), 0, 100),
    relaxed: clamp(Number(value?.relaxed ?? 36), 0, 100),
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

  return `LEO LLM V15.6.17 年輕自然女聲語氣核心：\n- 請用年輕、自然、溫柔的女性語氣說話，整體親切、聰明、自然，不要老成，不要像客服，不要像播報員，也不要像在背稿。\n- 保留自然音調與節奏，回答以短句為主，先講重點，再補充一句必要說明。語氣像一位自然、好相處、有腦、有親和力的年輕管家。\n- ${pitch}\n- ${cadence}\n- ${emotion}\n- ${fillers}\n- ${relaxed}\n- 可自然使用「好啊！」，用在同意、接話或輕快回應時。\n- 可偶爾使用「好咩」，只限輕鬆聊天情境，頻率要低，不可連續出現。\n- 可使用短聲「嗯」或思考用「嗯…」，但不要每句都加。\n- 使用「哦」表示理解或抓到重點時，音高微微提高，但不要卡通化。\n- 使用「好啦」收尾時，「啦」要稍微低聲、短一點，不要拖尾。\n- 語助詞必須自然、少量、分散，不得連續堆疊，不得形成固定口頭禪。\n- 避免書面感、過度表演、油膩感、誇張撒嬌、娃娃音與客服腔。\n- 目前參數：語速 ${tuning.speed.toFixed(2)}、頓挫感 ${Math.round(tuning.cadence)}%、情感 ${Math.round(tuning.emotion)}%、語助詞 ${Math.round(tuning.fillers)}%、慵懶感 ${Math.round(tuning.relaxed)}%。\n- 感知音高數值為 ${tuning.perceivedPitch}，只調整聽感與表達，不使用數位變調，不改變播放速度。\n- 以上參數只調整表達方式，不得改變事實、身份、安全規則或工具使用準確度。`;
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
