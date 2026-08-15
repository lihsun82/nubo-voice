"use client";

import { useEffect } from "react";

type QuestionCategory =
  | "一般問答"
  | "工作與旅館"
  | "旅遊與地點"
  | "工具與控制"
  | "通訊與郵件";

type QuestionItem = {
  id: string;
  text: string;
  category: QuestionCategory;
  createdAt: string;
};

const STORAGE_KEY = "nubo_question_history_v1";
const RECORD_EVENT = "nubo-question-record";

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function isMeaningfulQuestion(text: string) {
  const normalized = normalizeText(text);
  if (!normalized) return false;

  const ignoredCommands = [
    "nubo",
    "嗨nubo",
    "hanubo",
    "兄弟",
    "有人嗎",
    "閉嘴",
    "安靜",
    "退下",
    "停",
    "stop",
  ];

  return !ignoredCommands.includes(normalized);
}

function detectCategory(text: string): QuestionCategory {
  if (/(旅館|飯店|住宿|房價|房務|櫃檯|訂房|住房|ota|booking|agoda|營收|報表|班表|員工|工作流|任務|agent|自動化)/i.test(text)) {
    return "工作與旅館";
  }
  if (/(旅遊|旅行|行程|機票|航班|景點|餐廳|飲料店|咖啡|附近|地圖|導航|日本|東京|大阪|京都|沖繩|台南|台中|台北)/i.test(text)) {
    return "旅遊與地點";
  }
  if (/(開啟|關閉|播放|音樂|youtube|facebook|instagram|line|app|程式|計算機|音量|亮度|燈|電腦|手機|網頁|瀏覽器)/i.test(text)) {
    return "工具與控制";
  }
  if (/(寄信|郵件|email|gmail|簡訊|訊息|通知|聯絡|收件人|草稿|傳送)/i.test(text)) {
    return "通訊與郵件";
  }
  return "一般問答";
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function loadHistory(): QuestionItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 100) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: QuestionItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function recordNuboQuestion(text: string) {
  if (typeof window === "undefined") return;
  const trimmed = text.trim();
  if (!isMeaningfulQuestion(trimmed)) return;
  window.dispatchEvent(new CustomEvent(RECORD_EVENT, { detail: { text: trimmed } }));
}

export function NuboQuestionHistory() {
  useEffect(() => {
    const handleRecord = (event: Event) => {
      const customEvent = event as CustomEvent<{ text?: string }>;
      const text = customEvent.detail?.text?.trim();
      if (!text || !isMeaningfulQuestion(text)) return;

      const current = loadHistory();
      const latest = current[0];
      const latestTime = latest ? new Date(latest.createdAt).getTime() : 0;
      if (latest?.text === text && Date.now() - latestTime < 30_000) return;

      saveHistory([
        {
          id: createId(),
          text,
          category: detectCategory(text),
          createdAt: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 100));
    };

    window.addEventListener(RECORD_EVENT, handleRecord);
    return () => window.removeEventListener(RECORD_EVENT, handleRecord);
  }, []);

  // UI intentionally hidden; recording remains available for future restore.
  return null;
}
