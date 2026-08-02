export type NuboVoiceEngine = "gemini" | "openai";

export type GeminiVoiceName =
  | "Puck"
  | "Fenrir"
  | "Sadachbia"
  | "Achird"
  | "Charon"
  | "Orus"
  | "Kore"
  | "Sadaltager"
  | "Sulafat";

export type OpenAIVoiceName = "marin" | "cedar";
export type NuboVoiceName = GeminiVoiceName | OpenAIVoiceName;

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
    description: "速度快、目前穩定",
  },
  {
    id: "openai" as const,
    label: "OpenAI Realtime",
    description: "較擬人、情緒自然",
  },
];

export const NUBO_GEMINI_VOICES = [
  { id: "Puck" as const, label: "活潑 Puck", tone: "愉快、節奏明快" },
  { id: "Fenrir" as const, label: "興奮 Fenrir", tone: "情緒鮮明、反應有活力" },
  { id: "Sadachbia" as const, label: "生動 Sadachbia", tone: "表達生動、有朝氣" },
  { id: "Achird" as const, label: "親切 Achird", tone: "友善、自然、耐聽" },
  { id: "Charon" as const, label: "專業 Charon", tone: "資訊清楚、管家感" },
  { id: "Orus" as const, label: "堅定 Orus", tone: "穩定、果斷" },
  { id: "Kore" as const, label: "專業 Kore", tone: "堅定、俐落" },
  { id: "Sadaltager" as const, label: "知識 Sadaltager", tone: "博學、沉著" },
  { id: "Sulafat" as const, label: "溫暖 Sulafat", tone: "溫暖、舒適" },
];

export const NUBO_OPENAI_VOICES = [
  { id: "marin" as const, label: "擬人 Marin", tone: "自然、親切且清晰" },
  { id: "cedar" as const, label: "沉穩 Cedar", tone: "沉穩、自然" },
];

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
    subtitle: "俏皮兄弟",
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
    subtitle: "專業管家",
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
    subtitle: "自然陪伴",
    description: "使用現階段 API 可用的 Realtime 語音方案，接話與情緒更自然。",
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

export function getNuboProfileLabel(profile: NuboVoiceProfile) {
  const voice = [
    ...NUBO_GEMINI_VOICES,
    ...NUBO_OPENAI_VOICES,
  ].find((option) => option.id === profile.voice);
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
