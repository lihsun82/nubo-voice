"use client";

import { useSyncExternalStore } from "react";

export const NUBO_KIOSK_LANGUAGES = [
  ["zh", "繁體中文", "繁中"],
  ["en", "English", "EN"],
  ["ja", "日本語", "JA"],
  ["ko", "한국어", "KO"],
] as const;

export type NuboKioskLanguage = (typeof NUBO_KIOSK_LANGUAGES)[number][0];
type LanguagePreference = NuboKioskLanguage | "auto";

export const NUBO_KIOSK_LOCALES: Record<NuboKioskLanguage, string> = {
  zh: "zh-Hant-TW", en: "en", ja: "ja", ko: "ko",
};

const NEUTRAL_WORDS = new Set(["nubo", "ainubo", "hotel", "hotels", "line", "qr", "code", "wi", "fi", "wifi", "ai", "ok", "okay", "yes", "no", "um", "uh"]);
const ENGLISH_WORDS = new Set(["the", "this", "my", "you", "your", "we", "our", "with", "need", "would", "please", "where", "what", "how", "have", "want", "there", "are", "can", "could"]);

function detectSpokenLanguage(text: string, languageCode: unknown, previous: NuboKioskLanguage): NuboKioskLanguage | null {
  const normalized = text.normalize("NFKC").trim().toLowerCase();
  const words = normalized.match(/\p{L}+/gu) ?? [];
  if (!words.length || words.every((word) => NEUTRAL_WORDS.has(word))) return null;

  const primary = typeof languageCode === "string" ? languageCode.trim().toLowerCase().split(/[-_]/)[0] : "";
  const supported = primary === "yue" || primary === "cmn" || primary === "nan" ? "zh" :
    NUBO_KIOSK_LANGUAGES.find(([id]) => id === primary)?.[0];
  const kana = (normalized.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  const hangul = (normalized.match(/\p{Script=Hangul}/gu) ?? []).length;
  const han = (normalized.match(/\p{Script=Han}/gu) ?? []).length;

  // Kana and Hangul also disambiguate transcripts with missing or incorrect language metadata.
  if (hangul >= 2 && hangul > kana) return "ko";
  if (kana >= 2 || (kana > 0 && han > 0)) return "ja";
  if (primary && !supported && primary !== "und") return null;
  if (han >= 2) {
    if (supported && supported !== "en") return supported;
    if (/你好|您好|謝謝|谢谢|請問|请问/u.test(normalized)) return "zh";
    if (/予約|宿泊|荷物|部屋|受付|朝食/u.test(normalized) || (previous === "ja" && han <= 3)) return "ja";
    return "zh";
  }
  if (supported === "ko" && (hangul > 0 || words.length >= 2)) return "ko";
  if (supported === "ja" && (kana > 0 || words.length >= 2)) return "ja";

  const englishWords = new Set(words.filter((word) => ENGLISH_WORDS.has(word)));
  if (englishWords.size >= 2 || (supported === "en" && words.length >= 2) ||
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
  const next = detectSpokenLanguage(text, languageCode, spokenLanguage);
  if (!next || next === spokenLanguage) return;
  spokenLanguage = next;
  updatePreference(snapshot.preference);
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
