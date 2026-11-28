"use client";

import { useSyncExternalStore } from "react";
import { normalizeNuboGuestLanguage } from "./nubo-guest-language.ts";

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

// These captions match the fixed recordings used at call start.
export const NUBO_KIOSK_GREETINGS: Record<NuboKioskLanguage, string> = {
  zh: "Hello~歡迎新寶智慧酒店，我是你的智慧管家NUBO",
  en: "Hello, welcome to AINUBO Smart Hotel. I'm NUBO, your AI concierge.",
  ja: "Hello、AINUBOスマートホテルへようこそ。AIコンシェルジュのヌーボです。",
  ko: "Hello, 아이누보 스마트 호텔에 오신 것을 환영합니다. 저는 AI 컨시어지 누보입니다.",
  vi: "Hello, chào mừng quý khách đến với khách sạn thông minh AINUBO. Tôi là NUBO, trợ lý thông minh của quý khách.",
};

const NEUTRAL_WORDS = new Set(["nubo", "ainubo", "hotel", "hotels", "line", "qr", "code", "wi", "fi", "wifi", "ai", "ok", "okay", "yes", "no", "um", "uh"]);
const ENGLISH_WORDS = new Set(["the", "this", "my", "you", "your", "we", "our", "with", "need", "would", "please", "where", "what", "how", "have", "want", "there", "are", "can", "could"]);
const ENGLISH_HOTEL_WORDS = /\b(?:breakfast|parking|room|tonight|tomorrow|check[ -]?(?:in|out)|booking|reservation|luggage|available)\b/iu;
const ENGLISH_REPLY_WORDS = /\b(?:am|is|are|was|were|do|does|did|will|let|would|could|can|have|has|the|this|your|we|please|yes|no|here|thank|hello|welcome|sure|certainly|sorry|unfortunately|good|of|at|to)\b/iu;
const HOKKIEN_WORDING = /(?:我|阮|咱|恁)欲|歇睏|歇暝|一暝|佇遮|佇佗|偌濟|佗位|欲睏|袂使|袂曉|無代誌|這馬(?!路)|共[你恁](?:查|看|講)|閒間|食飽未|guá\s+beh/iu;
const TRANSCRIPT_LANGUAGE_CODES = new Map<string, NuboKioskLanguage>([
  ["chi", "zh"], ["cmn", "zh"], ["nan", "zh"], ["yue", "zh"], ["zho", "zh"],
  ["eng", "en"], ["jpn", "ja"], ["kor", "ko"], ["vie", "vi"],
]);
const REQUESTED_LANGUAGE_NAMES = new Map<string, NuboKioskLanguage | "nan">([
  ["中文", "zh"], ["國語", "zh"], ["国语", "zh"], ["chinese", "zh"], ["mandarin", "zh"],
  ["台灣國語", "zh"], ["臺灣國語", "zh"], ["台灣華語", "zh"], ["臺灣華語", "zh"], ["華語", "zh"],
  ["英文", "en"], ["英語", "en"], ["英语", "en"], ["english", "en"],
  ["日文", "ja"], ["日語", "ja"], ["日语", "ja"], ["日本語", "ja"], ["japanese", "ja"],
  ["韓文", "ko"], ["韩文", "ko"], ["韓語", "ko"], ["韩语", "ko"], ["korean", "ko"],
  ["越南文", "vi"], ["越南語", "vi"], ["越南语", "vi"], ["vietnamese", "vi"],
  ["台語", "nan"], ["臺語", "nan"], ["台灣台語", "nan"], ["臺灣台語", "nan"],
  ["taiwanese", "nan"], ["taiwanese hokkien", "nan"], ["hokkien", "nan"],
]);

function requestedLanguage(text: string) {
  const firstClause = text.split(/[。！？?!;；\n]/u, 1)[0].trim();
  const chineseClause = firstClause.replace(/^(?:你好|您好)[、，,\s]+/u, "").split(/[，,]/u, 1)[0];
  const chinese = chineseClause.replace(/[\s\p{P}]+/gu, "").match(
    /^(?:請|请|麻煩|麻烦)?(?:你|您|我)?(?:可(?:不可以|以))?(?:切[換换](?:到|成|為|为)?|[換换]成|改[用講讲說说]|[用講讲說说])(\p{L}+?)(?:和我[說说][話话]|回答我?|回[覆复]我?)?(?:可以[嗎吗]|好[嗎吗]|[嗎吗]|謝謝|谢谢)?$/u,
  );
  const english = firstClause.match(/^(?:(?:please|could you|can you|would you)\s+)*(?:switch to|use|speak|answer in|reply in|continue in)\s+([a-z]+(?: hokkien)?)(?:\s*,?\s*please)?(?:[.,]|$)/iu)
    ?? firstClause.match(/^([a-z]+(?: hokkien)?)(?:\s*,?\s*please)?[. ]*$/iu);
  return REQUESTED_LANGUAGE_NAMES.get(chinese?.[1] ?? english?.[1] ?? "");
}

function detectSpokenLanguage(text: string, languageCode: unknown, readLanguageRequest = true): NuboKioskLanguage | null {
  const normalized = text.normalize("NFKC").trim().toLowerCase();
  const words = normalized.match(/\p{L}+/gu) ?? [];
  if (!words.length || words.every((word) => NEUTRAL_WORDS.has(word))) return null;
  const requested = readLanguageRequest ? requestedLanguage(normalized) : null;
  if (requested) return requested === "nan" ? "zh" : requested;

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
      (ENGLISH_HOTEL_WORDS.test(plain) && (englishWords.size > 0 || words.length === 1)) ||
      (words.length >= 2 && /^(?:where|when|what|how|please)\b/u.test(normalized)) ||
      /^(?:hi|hello|thanks|thank you|good (?:morning|afternoon|evening)|check (?:in|out))[\s.!?]*$/u.test(normalized)) return "en";
  return null;
}

type Snapshot = { language: NuboKioskLanguage; preference: LanguagePreference };
const initial: Snapshot = { language: "zh", preference: "auto" };
const listeners = new Set<() => void>();
let snapshot = initial;
let spokenLanguage: NuboKioskLanguage = "zh";
let guestSpeechLanguage: string | null = null;

export function detectNuboGuestSpeechLanguage(text: string, languageCode?: unknown) {
  const reported = normalizeNuboGuestLanguage(languageCode);
  const detected = detectSpokenLanguage(text, undefined, false);
  if (detected === "en" && !/[^\p{Script=Latin}\P{L}]/u.test(text)) return "en";
  if ((!reported || reported === "zh" || reported === "nan") && HOKKIEN_WORDING.test(text)) return "nan";
  // A dialect label alone can be wrong, especially for Mandarin spoken in Taiwan.
  if (reported === "nan") return detected ?? (/\p{Script=Han}/u.test(text) ? "zh" : null);
  return reported ?? detected;
}

export function detectNuboGuestReplyLanguage(text: string, languageCode?: unknown) {
  return requestedLanguage(text.normalize("NFKC").trim().toLowerCase()) ?? detectNuboGuestSpeechLanguage(text, languageCode);
}

export function checkNuboEnglishReply(text: string, complete: boolean) {
  const normalized = text.normalize("NFKC").trim();
  if (/[^\p{Script=Latin}\P{L}]/u.test(normalized)) return "mismatch";
  if (detectSpokenLanguage(normalized, undefined, false) === "vi") return "mismatch";
  const words = normalized.match(/[a-z]+/giu) ?? [];
  const hasEnglishWords = ENGLISH_REPLY_WORDS.test(normalized) || ENGLISH_HOTEL_WORDS.test(normalized);
  if (hasEnglishWords && (words.length >= 2 || (words.length === 1 && (complete || /[.!?]$/u.test(normalized))))) return "match";
  return "waiting";
}

export function checkNuboMandarinReply(text: string, complete: boolean, languageCode?: unknown) {
  const normalized = text.normalize("NFKC").trim();
  if (HOKKIEN_WORDING.test(normalized) || normalizeNuboGuestLanguage(languageCode) === "nan") return "mismatch";
  return normalized || complete ? "match" : "waiting";
}

export function getNuboGuestSpeechLanguage() {
  return guestSpeechLanguage;
}

export function clearNuboGuestSpeechLanguage() {
  guestSpeechLanguage = null;
}

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
  guestSpeechLanguage = detectNuboGuestSpeechLanguage(text, languageCode) ?? guestSpeechLanguage;
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
  clearNuboGuestSpeechLanguage();
  spokenLanguage = "zh";
  updatePreference("auto");
}

export function useNuboKioskLanguage() {
  return useSyncExternalStore(subscribe, () => snapshot, () => initial);
}
