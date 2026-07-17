export type NuboVoiceProvider = "gemini" | "openai";
export type NuboVoicePersonality =
  | "playful"
  | "professional"
  | "companion"
  | "minimal";

export type NuboVoiceProfile = {
  provider: NuboVoiceProvider;
  geminiVoice: string;
  openaiVoice: string;
  personality: NuboVoicePersonality;
};

export type VoiceOption = {
  id: string;
  label: string;
  description: string;
};

export const NUBO_VOICE_PROFILE_KEY =
  "nubo_voice_profile_v1";

export const geminiVoiceOptions: VoiceOption[] = [
  {
    id: "Achird",
    label: "Achird｜親切自然",
    description: "友善、自然，適合日常長時間對話。",
  },
  {
    id: "Puck",
    label: "Puck｜活潑俏皮",
    description: "節奏明快，適合俏皮兄弟模式。",
  },
  {
    id: "Sadachbia",
    label: "Sadachbia｜生動有戲",
    description: "情緒較明顯，互動感更強。",
  },
  {
    id: "Charon",
    label: "Charon｜資訊專業",
    description: "清楚穩定，適合工作與報告。",
  },
  {
    id: "Kore",
    label: "Kore｜堅定專業",
    description: "語氣俐落，適合正式工作。",
  },
  {
    id: "Sulafat",
    label: "Sulafat｜溫暖陪伴",
    description: "聲線溫暖，適合自然陪伴。",
  },
];

export const openaiVoiceOptions: VoiceOption[] = [
  {
    id: "marin",
    label: "Marin｜高擬人自然",
    description: "自然親切，OpenAI官方推薦的高品質聲線。",
  },
  {
    id: "cedar",
    label: "Cedar｜沉穩專業",
    description: "穩定清晰，OpenAI官方推薦的高品質聲線。",
  },
  {
    id: "coral",
    label: "Coral｜明亮有活力",
    description: "互動感較強，適合輕鬆聊天。",
  },
  {
    id: "sage",
    label: "Sage｜知性柔和",
    description: "語氣柔和，適合解說與陪伴。",
  },
];

export const personalityOptions: Array<{
  id: NuboVoicePersonality;
  label: string;
  description: string;
}> = [
  {
    id: "playful",
    label: "俏皮兄弟",
    description: "有一點三八、會吐槽，偶爾自然輕笑。",
  },
  {
    id: "professional",
    label: "專業管家",
    description: "精準、沉穩、工作導向。",
  },
  {
    id: "companion",
    label: "自然陪伴",
    description: "像熟悉的朋友，溫暖、有同理心。",
  },
  {
    id: "minimal",
    label: "極簡快速",
    description: "優先速度，只說必要內容。",
  },
];

export const defaultNuboVoiceProfile: NuboVoiceProfile = {
  provider: "gemini",
  geminiVoice: "Achird",
  openaiVoice: "marin",
  personality: "companion",
};

function isPersonality(
  value: unknown,
): value is NuboVoicePersonality {
  return personalityOptions.some(
    (option) => option.id === value,
  );
}

function validVoice(
  value: unknown,
  options: VoiceOption[],
  fallback: string,
) {
  return options.some(
    (option) => option.id === value,
  )
    ? String(value)
    : fallback;
}

export function readNuboVoiceProfile(): NuboVoiceProfile {
  if (typeof window === "undefined") {
    return defaultNuboVoiceProfile;
  }

  try {
    const raw = window.localStorage.getItem(
      NUBO_VOICE_PROFILE_KEY,
    );
    if (!raw) return defaultNuboVoiceProfile;

    const parsed = JSON.parse(raw) as Partial<NuboVoiceProfile>;
    return {
      provider:
        parsed.provider === "openai"
          ? "openai"
          : "gemini",
      geminiVoice: validVoice(
        parsed.geminiVoice,
        geminiVoiceOptions,
        defaultNuboVoiceProfile.geminiVoice,
      ),
      openaiVoice: validVoice(
        parsed.openaiVoice,
        openaiVoiceOptions,
        defaultNuboVoiceProfile.openaiVoice,
      ),
      personality: isPersonality(parsed.personality)
        ? parsed.personality
        : defaultNuboVoiceProfile.personality,
    };
  } catch {
    return defaultNuboVoiceProfile;
  }
}

export function saveNuboVoiceProfile(
  profile: NuboVoiceProfile,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    NUBO_VOICE_PROFILE_KEY,
    JSON.stringify(profile),
  );
}

export function getNuboPersonalityInstruction(
  personality: NuboVoicePersonality,
) {
  if (personality === "playful") {
    return [
      "目前個性是俏皮兄弟模式。",
      "說話活潑、有一點三八與幽默，可以偶爾自然輕笑或短暫吐槽，但不要每句都笑，也不要用文字硬唸『哈哈哈』。",
      "遇到旅館營運、Gmail、金錢、安全或正式工作時，自動收斂成精準專業語氣。",
      "使用者說『認真一點』時立即停止玩笑；說『輕鬆一點』時再恢復俏皮。",
    ].join("\n");
  }

  if (personality === "professional") {
    return [
      "目前個性是專業AI管家模式。",
      "語氣沉穩、精準、有條理，先給結論，再補必要資訊。",
      "避免過度寒暄、浮誇情緒與不必要笑聲。",
    ].join("\n");
  }

  if (personality === "minimal") {
    return [
      "目前個性是極簡快速模式。",
      "優先低延遲，通常用一到三句回答；工具完成後只回報結果與下一個必要動作。",
      "除非使用者明確要求詳細說明，否則不要長篇朗讀。",
    ].join("\n");
  }

  return [
    "目前個性是自然陪伴模式。",
    "像熟悉的朋友一樣自然、溫暖、有同理心，保持簡潔，不要刻意表演。",
    "可以有自然停頓與輕微情緒，但正式工作仍要準確可靠。",
  ].join("\n");
}
