export const NUBO_LANGUAGE_MODE_STORAGE_KEY = "nubo_language_mode_v1";
export const NUBO_LANGUAGE_MODE_EVENT = "nubo:language-mode-change";

export type NuboLanguageMode = "auto" | "taiwanese" | "mandarin" | "mixed";

export const NUBO_DEFAULT_LANGUAGE_MODE: NuboLanguageMode = "auto";

export const NUBO_LANGUAGE_OPTIONS: ReadonlyArray<{
  id: NuboLanguageMode;
  label: string;
  note: string;
}> = [
  {
    id: "auto",
    label: "自動辨識",
    note: "依使用者當下使用的臺灣華語或臺灣台語自然回覆",
  },
  {
    id: "taiwanese",
    label: "臺灣台語",
    note: "固定使用臺灣本地台語，不使用其他國家或地區的閩南語腔調",
  },
  {
    id: "mandarin",
    label: "臺灣華語",
    note: "固定使用臺灣自然口語華語",
  },
  {
    id: "mixed",
    label: "華台混合",
    note: "像臺灣日常聊天，依情境自然穿插華語與台語",
  },
];

export function normalizeNuboLanguageMode(value: unknown): NuboLanguageMode {
  return value === "taiwanese" || value === "mandarin" || value === "mixed"
    ? value
    : "auto";
}

export function readNuboLanguageMode(): NuboLanguageMode {
  if (typeof window === "undefined") return NUBO_DEFAULT_LANGUAGE_MODE;
  return normalizeNuboLanguageMode(
    window.localStorage.getItem(NUBO_LANGUAGE_MODE_STORAGE_KEY),
  );
}

export function saveNuboLanguageMode(mode: NuboLanguageMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NUBO_LANGUAGE_MODE_STORAGE_KEY, mode);
  window.dispatchEvent(
    new CustomEvent<NuboLanguageMode>(NUBO_LANGUAGE_MODE_EVENT, {
      detail: mode,
    }),
  );
}

export function buildNuboLanguageInstruction(mode: NuboLanguageMode) {
  const shared = `語言與腔口規則：\n- 「台語」一律專指臺灣本地使用的臺灣台語（Taiwanese Hokkien）。\n- 不使用中國福建地方腔、潮州話、海南話、粵語，也不使用新加坡、馬來西亞或其他東南亞閩南語腔調。\n- 優先採用臺灣人熟悉的發音、詞彙、語氣、句型與生活用法。\n- 臺灣台語發音要像臺灣本地年輕女性自然說話，不要播音員腔、長輩腔或刻意朗誦。\n- 飯店情境詞彙要準確，包括：房間、房卡、入住、退房、櫃檯、電梯、停車位、捷運站、訂房、房價、行李、冷氣、熱水、毛巾、早餐。\n- 若台語詞彙或使用者意思不確定，先用臺灣華語簡短確認，不可自行猜成其他閩南語變體。`;

  if (mode === "taiwanese") {
    return `${shared}\n- 目前模式：臺灣台語。除專有名詞、數字或必要澄清外，盡量全程使用臺灣台語回答。\n- 不要把臺灣華語句子逐字硬翻成台語；要使用臺灣人自然會說的台語句型。`;
  }

  if (mode === "mandarin") {
    return `${shared}\n- 目前模式：臺灣華語。固定使用臺灣自然口語華語回答；除非使用者明確要求，暫不切換台語。`;
  }

  if (mode === "mixed") {
    return `${shared}\n- 目前模式：華台混合。像臺灣人日常聊天，依情境自然穿插臺灣華語與臺灣台語，但不要每句刻意混用。\n- 使用者整段講台語時，台語比例提高；整段講華語時，以華語為主並少量自然穿插台語。`;
  }

  return `${shared}\n- 目前模式：自動辨識。使用者主要講臺灣台語時，以臺灣台語回答；主要講臺灣華語時，以臺灣華語回答。\n- 使用者切換語言時自然跟隨，不需特別宣告正在切換。`;
}
