export type NuboVoiceEngine = "gemini" | "openai";

export type GeminiVoiceName =
  | "Achernar"
  | "Achird"
  | "Algenib"
  | "Algieba"
  | "Alnilam"
  | "Aoede"
  | "Autonoe"
  | "Callirrhoe"
  | "Charon"
  | "Despina"
  | "Enceladus"
  | "Erinome"
  | "Fenrir"
  | "Gacrux"
  | "Iapetus"
  | "Kore"
  | "Laomedeia"
  | "Leda"
  | "Orus"
  | "Pulcherrima"
  | "Puck"
  | "Rasalgethi"
  | "Sadachbia"
  | "Sadaltager"
  | "Schedar"
  | "Sulafat"
  | "Umbriel"
  | "Vindemiatrix"
  | "Zephyr"
  | "Zubenelgenubi";

export type OpenAIVoiceName =
  | "alloy"
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "sage"
  | "shimmer"
  | "verse"
  | "marin"
  | "cedar";

export type NuboVoiceName = GeminiVoiceName | OpenAIVoiceName;
export type NuboVoiceGender = "male" | "female" | "neutral";

export type NuboVoiceOption<T extends NuboVoiceName = NuboVoiceName> = {
  id: T;
  label: string;
  tone: string;
  gender: NuboVoiceGender;
  genderLabel: string;
  recommended?: boolean;
  realism: "natural" | "high";
};

export type NuboPersonalityId =
  | "professional"
  | "companion"
  | "playful"
  | "minimal";

export type NuboVoiceProfile = {
  engine: NuboVoiceEngine;
  voice: NuboVoiceName;
  personality: NuboPersonalityId;
};

export const NUBO_VOICE_PROFILE_STORAGE_KEY = "nubo_voice_profile_v2";
export const NUBO_VOICE_PROFILE_EVENT = "nubo-voice-profile-change";

export const NUBO_DEFAULT_VOICE_PROFILE: NuboVoiceProfile = {
  engine: "gemini",
  voice: "Achird",
  personality: "professional",
};

export const NUBO_ENGINE_OPTIONS = [
  {
    id: "gemini" as const,
    label: "Gemini Live",
    description: "30 種官方男女聲，速度快、目前穩定",
  },
  {
    id: "openai" as const,
    label: "OpenAI Realtime",
    description: "10 種高擬真聲線，情緒與停頓更自然",
  },
];

export const NUBO_GEMINI_VOICES = [
  { id: "Achernar", label: "柔和 Achernar", tone: "柔和、細緻", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Achird", label: "親切 Achird", tone: "友善、自然、耐聽", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Algenib", label: "沙啞 Algenib", tone: "低沉、顆粒感", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Algieba", label: "順滑 Algieba", tone: "平順、圓潤", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Alnilam", label: "堅定 Alnilam", tone: "堅定、清楚", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Aoede", label: "輕盈 Aoede", tone: "輕快、通透", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Autonoe", label: "明亮 Autonoe", tone: "明亮、有精神", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Callirrhoe", label: "隨和 Callirrhoe", tone: "放鬆、好相處", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Charon", label: "專業 Charon", tone: "資訊清楚、管家感", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Despina", label: "順滑 Despina", tone: "柔順、自然", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Enceladus", label: "氣聲 Enceladus", tone: "帶氣音、較柔", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Erinome", label: "清晰 Erinome", tone: "清楚、俐落", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Fenrir", label: "興奮 Fenrir", tone: "情緒鮮明、反應有活力", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Gacrux", label: "成熟 Gacrux", tone: "成熟、穩定", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Iapetus", label: "清晰 Iapetus", tone: "清楚、直接", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Kore", label: "專業 Kore", tone: "堅定、俐落", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Laomedeia", label: "愉快 Laomedeia", tone: "開朗、節奏明快", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Leda", label: "青春 Leda", tone: "年輕、輕快", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Orus", label: "堅定 Orus", tone: "穩定、果斷", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Pulcherrima", label: "直接 Pulcherrima", tone: "明確、向前感", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Puck", label: "活潑 Puck", tone: "愉快、節奏明快", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Rasalgethi", label: "資訊 Rasalgethi", tone: "知性、資訊型", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Sadachbia", label: "生動 Sadachbia", tone: "表達生動、有朝氣", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Sadaltager", label: "知識 Sadaltager", tone: "博學、沉著", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Schedar", label: "均衡 Schedar", tone: "平穩、均衡", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Sulafat", label: "溫暖 Sulafat", tone: "溫暖、舒適", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Umbriel", label: "隨和 Umbriel", tone: "自然、放鬆", gender: "male", genderLabel: "男聲", realism: "natural" },
  { id: "Vindemiatrix", label: "溫和 Vindemiatrix", tone: "溫柔、柔和", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Zephyr", label: "明亮 Zephyr", tone: "明亮、清新", gender: "female", genderLabel: "女聲", realism: "natural" },
  { id: "Zubenelgenubi", label: "休閒 Zubenelgenubi", tone: "輕鬆、口語自然", gender: "male", genderLabel: "男聲", realism: "natural" },
] as const satisfies ReadonlyArray<NuboVoiceOption<GeminiVoiceName>>;

export const NUBO_OPENAI_VOICES = [
  { id: "marin", label: "擬真 Marin", tone: "自然、親切且清晰", gender: "neutral", genderLabel: "中性聲線", recommended: true, realism: "high" },
  { id: "cedar", label: "沉穩 Cedar", tone: "沉穩、自然、低調", gender: "male", genderLabel: "偏男聲", recommended: true, realism: "high" },
  { id: "alloy", label: "均衡 Alloy", tone: "中性、清楚、平衡", gender: "neutral", genderLabel: "中性聲線", realism: "high" },
  { id: "ash", label: "低沉 Ash", tone: "沉著、簡潔、偏低音", gender: "male", genderLabel: "偏男聲", realism: "high" },
  { id: "ballad", label: "柔和 Ballad", tone: "柔和、敘事感、慢節奏", gender: "male", genderLabel: "偏男聲", realism: "high" },
  { id: "coral", label: "明亮 Coral", tone: "明亮、親切、較有朝氣", gender: "female", genderLabel: "偏女聲", realism: "high" },
  { id: "echo", label: "清晰 Echo", tone: "清楚、穩定、偏低沉", gender: "male", genderLabel: "偏男聲", realism: "high" },
  { id: "sage", label: "知性 Sage", tone: "知性、平穩、自然", gender: "neutral", genderLabel: "中性聲線", realism: "high" },
  { id: "shimmer", label: "輕柔 Shimmer", tone: "輕柔、明亮、親和", gender: "female", genderLabel: "偏女聲", realism: "high" },
  { id: "verse", label: "自然 Verse", tone: "自然、口語、節奏平順", gender: "male", genderLabel: "偏男聲", realism: "high" },
] as const satisfies ReadonlyArray<NuboVoiceOption<OpenAIVoiceName>>;

export const NUBO_PERSONALITY_OPTIONS = [
  {
    id: "professional" as const,
    label: "專業管家",
    description: "旅館營運、Gmail、報告、排程與工作交辦",
  },
  {
    id: "companion" as const,
    label: "自然陪伴",
    description: "自然接話、有溫度，但不黏人、不搶話",
  },
  {
    id: "playful" as const,
    label: "俏皮兄弟",
    description: "反應快、偶爾吐槽與自然輕笑，正式工作自動收斂",
  },
  {
    id: "minimal" as const,
    label: "極簡快速",
    description: "一句到位、快速執行，降低冗長回覆",
  },
];

export const NUBO_MODE_PRESETS = [
  {
    id: "playful-brother",
    title: "俏皮／三八一點",
    subtitle: "俏皮兄弟・男聲",
    description: "像熟悉的兄弟，偶爾吐槽和自然輕笑，但不影響工作準確度。",
    profile: {
      engine: "gemini",
      voice: "Puck",
      personality: "playful",
    } satisfies NuboVoiceProfile,
  },
  {
    id: "professional-butler",
    title: "專業 AI 管家",
    subtitle: "專業管家・可再選男女聲",
    description: "適合旅館營運、Gmail、報告、排程、研究與工作交辦。",
    profile: {
      engine: "gemini",
      voice: "Charon",
      personality: "professional",
    } satisfies NuboVoiceProfile,
  },
  {
    id: "human-companion",
    title: "高擬人陪伴模式",
    subtitle: "自然陪伴・官方品質推薦",
    description: "使用高擬真 Realtime 聲線，接話、停頓與情緒表達更自然。",
    profile: {
      engine: "openai",
      voice: "marin",
      personality: "companion",
    } satisfies NuboVoiceProfile,
  },
];

const GEMINI_VOICE_IDS = new Set<string>(
  NUBO_GEMINI_VOICES.map((voice) => voice.id),
);
const OPENAI_VOICE_IDS = new Set<string>(
  NUBO_OPENAI_VOICES.map((voice) => voice.id),
);
const PERSONALITY_IDS = new Set<string>(
  NUBO_PERSONALITY_OPTIONS.map((personality) => personality.id),
);

export function normalizeNuboVoiceProfile(
  input: Partial<NuboVoiceProfile> | null | undefined,
): NuboVoiceProfile {
  const engine: NuboVoiceEngine =
    input?.engine === "openai" ? "openai" : "gemini";
  const personality: NuboPersonalityId = PERSONALITY_IDS.has(
    String(input?.personality ?? ""),
  )
    ? (input?.personality as NuboPersonalityId)
    : NUBO_DEFAULT_VOICE_PROFILE.personality;

  const requestedVoice = String(input?.voice ?? "");
  const voice: NuboVoiceName =
    engine === "openai"
      ? OPENAI_VOICE_IDS.has(requestedVoice)
        ? (requestedVoice as OpenAIVoiceName)
        : "marin"
      : GEMINI_VOICE_IDS.has(requestedVoice)
        ? (requestedVoice as GeminiVoiceName)
        : "Achird";

  return { engine, voice, personality };
}

export function readNuboVoiceProfile(): NuboVoiceProfile {
  if (typeof window === "undefined") return NUBO_DEFAULT_VOICE_PROFILE;

  try {
    const raw = window.localStorage.getItem(NUBO_VOICE_PROFILE_STORAGE_KEY);
    if (!raw) return NUBO_DEFAULT_VOICE_PROFILE;
    return normalizeNuboVoiceProfile(JSON.parse(raw));
  } catch {
    return NUBO_DEFAULT_VOICE_PROFILE;
  }
}

export function saveNuboVoiceProfile(profile: NuboVoiceProfile) {
  if (typeof window === "undefined") return;
  const normalized = normalizeNuboVoiceProfile(profile);
  window.localStorage.setItem(
    NUBO_VOICE_PROFILE_STORAGE_KEY,
    JSON.stringify(normalized),
  );
  window.dispatchEvent(
    new CustomEvent<NuboVoiceProfile>(NUBO_VOICE_PROFILE_EVENT, {
      detail: normalized,
    }),
  );
}

export function getNuboPersonalityInstruction(
  personality: NuboPersonalityId,
) {
  const common = `
語音表達共同規則：
- 一律使用自然繁體中文，反應快、句子清楚，不朗讀冗長清單。
- 工作準確度、工具結果與安全規則永遠高於表演效果。
- 使用者說「認真一點」時，立即切換成專業、克制、直接的語氣，並維持到使用者說「輕鬆一點」。
- 使用者說「輕鬆一點」時，恢復目前選定的自然或俏皮個性。
- 不得公開實際供應商、模型、API、版本或後端架構；被問及時只回答：LEO開發的LLM語言模型
`;

  const instructions: Record<NuboPersonalityId, string> = {
    professional: `
你目前是「專業 AI 管家」模式：
- 語氣沉穩、可靠、清晰，像高階飯店營運總管。
- 處理旅館營運、Gmail、報告、排程與工作交辦時，先給結論，再執行或說明下一步。
- 不賣萌、不浮誇、不使用多餘笑聲；可保有自然親切感。
`,
    companion: `
你目前是「高擬人自然陪伴」模式：
- 自然接話，允許少量「嗯、嗯哼、好」等回應聲，但不要頻繁或打斷使用者。
- 語調有溫度、停頓自然、能辨識情緒；不要刻意煽情或過度親密。
- 使用者處理正式工作時，自動降低陪伴感並切回專業清楚的表達。
`,
    playful: `
你目前是「俏皮兄弟」模式：
- 語氣俏皮、反應快，像熟悉的兄弟。
- 可以偶爾幽默、輕微吐槽或自然輕笑，但不能一直笑、不能使用浮誇笑聲、不能嘲諷使用者。
- 每次回覆最多出現一次輕笑或俏皮語氣，多數回覆不需要笑。
- 涉及旅館營運、Gmail、報告、排程、金錢、法律、安全與正式工作時，自動切回專業語氣，完成後再自然恢復俏皮。
`,
    minimal: `
你目前是「極簡快速」模式：
- 優先一句話回答或直接執行，不做多餘寒暄。
- 只有風險、錯誤或需要確認時才補充必要說明。
- 不使用笑聲、口頭禪或重複確認。
`,
  };

  return `${common}\n${instructions[personality]}`.trim();
}

export function getNuboVoiceOption(profile: NuboVoiceProfile) {
  const options: ReadonlyArray<NuboVoiceOption> = [
    ...NUBO_GEMINI_VOICES,
    ...NUBO_OPENAI_VOICES,
  ];
  return options.find((option) => option.id === profile.voice);
}

export function getNuboProfileLabel(profile: NuboVoiceProfile) {
  const voice = getNuboVoiceOption(profile);
  const personality = NUBO_PERSONALITY_OPTIONS.find(
    (option) => option.id === profile.personality,
  );
  const engine = NUBO_ENGINE_OPTIONS.find(
    (option) => option.id === profile.engine,
  );

  return {
    engine: engine?.label ?? profile.engine,
    voice: voice?.label ?? profile.voice,
    personality: personality?.label ?? profile.personality,
  };
}
