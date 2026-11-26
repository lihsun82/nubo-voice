"use client";

import { useSyncExternalStore } from "react";

export const NUBO_KIOSK_LANGUAGES = [
  ["zh", "繁體中文", "繁中"],
  ["en", "English", "EN"],
  ["ja", "日本語", "JA"],
  ["ko", "한국어", "KO"],
  ["vi", "Tiếng Việt", "VI"],
] as const;

export type NuboKioskLanguage = (typeof NUBO_KIOSK_LANGUAGES)[number][0];
type LanguagePreference = NuboKioskLanguage | "auto";

export const NUBO_KIOSK_LOCALES: Record<NuboKioskLanguage, string> = {
  zh: "zh-Hant-TW", en: "en", ja: "ja", ko: "ko", vi: "vi-VN",
};

const NEUTRAL_WORDS = new Set(["nubo", "ainubo", "hotel", "hotels", "line", "qr", "code", "wi", "fi", "wifi", "ai", "ok", "okay", "yes", "no", "um", "uh"]);
const ENGLISH_WORDS = new Set(["the", "this", "my", "you", "your", "we", "our", "with", "need", "would", "please", "where", "what", "how", "have", "want", "there", "are", "can", "could"]);
const TRANSCRIPT_LANGUAGE_CODES = new Map<string, NuboKioskLanguage>([
  ["chi", "zh"], ["cmn", "zh"], ["nan", "zh"], ["yue", "zh"], ["zho", "zh"],
  ["eng", "en"], ["jpn", "ja"], ["kor", "ko"], ["vie", "vi"],
]);
const REQUESTED_LANGUAGE_NAMES = new Map<string, NuboKioskLanguage>([
  ["中文", "zh"], ["國語", "zh"], ["国语", "zh"], ["chinese", "zh"], ["mandarin", "zh"],
  ["英文", "en"], ["英語", "en"], ["英语", "en"], ["english", "en"],
  ["日文", "ja"], ["日語", "ja"], ["日语", "ja"], ["日本語", "ja"], ["japanese", "ja"],
  ["韓文", "ko"], ["韩文", "ko"], ["韓語", "ko"], ["韩语", "ko"], ["korean", "ko"],
  ["越南文", "vi"], ["越南語", "vi"], ["越南语", "vi"], ["vietnamese", "vi"],
]);

function requestedLanguage(text: string) {
  const chinese = text.replace(/[\s\p{P}]+/gu, "").match(
    /^(?:請|请|麻煩|麻烦)?(?:你|您)?(?:切[換换](?:到|成|為|为)?|[換换]成|改[用講讲說说]|[用講讲說说])(\p{L}+?)(?:和我[說说][話话]|回答我?|回[覆复]我?)?(?:可以[嗎吗]|好[嗎吗]|謝謝|谢谢)?$/u,
  );
  const english = text.match(/^(?:please\s+|could you\s+|can you\s+)?(?:switch to|speak|answer in|reply in)\s+(\w+)(?:\s+please)?[\s.!?]*$/u);
  return REQUESTED_LANGUAGE_NAMES.get(chinese?.[1] ?? english?.[1] ?? "");
}

function detectSpokenLanguage(text: string, languageCode: unknown): NuboKioskLanguage | null {
  const normalized = text.normalize("NFKC").trim().toLowerCase();
  const words = normalized.match(/\p{L}+/gu) ?? [];
  if (!words.length || words.every((word) => NEUTRAL_WORDS.has(word))) return null;
  const requested = requestedLanguage(normalized);
  if (requested) return requested;

  const primary = typeof languageCode === "string" ? languageCode.trim().toLowerCase().split(/[-_]/)[0] : "";
  const supported = TRANSCRIPT_LANGUAGE_CODES.get(primary) ?? NUBO_KIOSK_LANGUAGES.find(([id]) => id === primary)?.[0];
  const kana = (normalized.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  const hangul = (normalized.match(/\p{Script=Hangul}/gu) ?? []).length;
  const han = (normalized.match(/\p{Script=Han}/gu) ?? []).length;

  // Kana and Hangul also disambiguate transcripts with missing or incorrect language metadata.
  if (hangul > kana) return "ko";
  if (kana > 0) return "ja";
  const plain = normalized.normalize("NFD").replace(/\p{M}/gu, "").replaceAll("đ", "d");
  if (supported === "vi" || /[ăđơư\u1ea0-\u1ef9]/u.test(normalized) ||
    /\b(?:xin chao|cam on|toi muon|cho toi|dat phong|khach san|phong nghi|bao nhieu|o dau)\b/u.test(plain)) return "vi";
  if (primary && !supported && primary !== "und") return null;
  if (han >= 2) {
    if (/你好|您好|謝謝|谢谢|請問|请问/u.test(normalized)) return "zh";
    if (/予約|宿泊|荷物|部屋|受付|朝食|満室|駐車場|電話番号|日本語/u.test(normalized)) return "ja";
    if (supported === "ja" || supported === "ko") return supported;
    return "zh";
  }
  if (supported === "ko" || supported === "ja") return supported;
  if (/\b(?:konnichiwa|arigatou|ohayou|sumimasen|onegaishimasu)\b/u.test(plain)) return "ja";

  const englishWords = new Set(words.filter((word) => ENGLISH_WORDS.has(word)));
  if (englishWords.size >= 2 || (supported === "en" && words.length >= 2) ||
      (words.length >= 2 && /^(?:where|when|what|how|please)\b/u.test(normalized)) ||
      /^(?:hi|hello|thanks|thank you|good (?:morning|afternoon|evening)|check (?:in|out))[\s.!?]*$/u.test(normalized)) return "en";
  return null;
}

type Snapshot = { language: NuboKioskLanguage; preference: LanguagePreference };
const initial: Snapshot = { language: "zh", preference: "auto" };
const listeners = new Set<() => void>();
let snapshot = initial;
let spokenLanguage: NuboKioskLanguage = "zh";

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function updatePreference(preference: LanguagePreference) {
  const language = preference === "auto" ? spokenLanguage : preference;
  if (snapshot.language === language && snapshot.preference === preference) return;
  snapshot = { language, preference };
  listeners.forEach((listener) => listener());
}

export function reportNuboKioskSpeech(text: string, languageCode?: unknown) {
  const next = detectSpokenLanguage(text, languageCode);
  if (!next) return false;
  const current = snapshot.language;
  spokenLanguage = next;
  // A new spoken language takes over from the welcome screen's manual selection.
  updatePreference(current !== next ? "auto" : snapshot.preference);
  return snapshot.language !== current;
}

export function selectNuboKioskLanguage(preference: LanguagePreference) {
  updatePreference(preference);
}

export function resetNuboKioskLanguage() {
  spokenLanguage = "zh";
  updatePreference("auto");
}

export function useNuboKioskLanguage() {
  return useSyncExternalStore(subscribe, () => snapshot, () => initial);
}
