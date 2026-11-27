const LANGUAGE_LABELS = {
  zh: "中文", nan: "台語", ja: "日文", ko: "韓文", en: "英文", vi: "越南文",
} as const;

const PROVIDER_ALIASES: Record<string, string> = {
  chi: "zh", cmn: "zh", zho: "zh", jpn: "ja", kor: "ko", eng: "en", vie: "vi",
};

const displayNames = new Intl.DisplayNames("zh-TW", { type: "language", fallback: "none" });

export function normalizeNuboGuestLanguage(value: unknown): string | null {
  if (typeof value !== "string" || !/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/iu.test(value.trim())) return null;
  const primary = value.trim().toLowerCase().split(/[-_]/u)[0];
  if (primary === "und" || primary === "mul") return null;
  const code = PROVIDER_ALIASES[primary] ?? primary;
  return Object.hasOwn(LANGUAGE_LABELS, code) || displayNames.of(code) ? code : null;
}

export function formatNuboGuestLanguage(value: unknown) {
  const code = normalizeNuboGuestLanguage(value);
  if (!code) return "未辨識";
  return LANGUAGE_LABELS[code as keyof typeof LANGUAGE_LABELS] ?? displayNames.of(code) ?? "未辨識";
}
