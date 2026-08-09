"use client";

const RESEARCH_TIMEOUT_MS = 10_000;

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[\s　]+/g, " ");
}

function chineseCharacterCount(value: string) {
  return (value.match(/[\u3400-\u9fff]/g) ?? []).length;
}

function hasExplicitResearchIntent(value: string) {
  return /(最新|查證|查一下|查詢|搜尋|研究|比較|來源|新聞|行情|市場|網路資料|資料來源|多來源|深入分析)/i.test(
    value,
  );
}

function hasCurrentAffairsIntent(value: string) {
  return /(最近|目前|現在|今天|昨日|昨天|本週|這週|近期|即時|剛剛|剛才|颱風|颱風警報|熱帶性低氣壓|豪雨|地震|國際時事|國際新聞|政治|選舉|政府|科技時事|科技新聞|AI新聞|人工智慧新聞|新機|新品|發表會|流行|趨勢|熱門|熱搜|股市|匯率|油價|金價|戰爭|衝突|外交|制裁|關稅|疫情|停班停課)/i.test(
    value,
  );
}

export function shouldBlockVoiceResearch(questionValue: unknown) {
  const question = normalize(questionValue);
  const chineseCount = chineseCharacterCount(question);

  if (!question) {
    return {
      blocked: true,
      reason: "語音辨識內容是空白，請使用者再說一次。",
    };
  }

  /*
   * Gemini Live偶爾會把短中文誤辨識成Também、Ok、Yeah等外語片段。
   * 這類片段不得進入約30秒的研究流程。
   */
  if (
    question.length <= 24 &&
    chineseCount === 0 &&
    !hasExplicitResearchIntent(question) &&
    !hasCurrentAffairsIntent(question)
  ) {
    return {
      blocked: true,
      reason:
        `剛才語音可能辨識錯誤（${question}）。請直接用繁體中文請使用者重說一次，不要再次呼叫任何工具。`,
    };
  }

  if (
    question.length <= 8 &&
    chineseCount <= 2 &&
    !hasExplicitResearchIntent(question) &&
    !hasCurrentAffairsIntent(question)
  ) {
    return {
      blocked: true,
      reason:
        "剛才語音內容太短或不清楚。請直接請使用者重說一次，不要呼叫研究工具。",
    };
  }

  if (
    !hasExplicitResearchIntent(question) &&
    !hasCurrentAffairsIntent(question)
  ) {
    return {
      blocked: true,
      reason:
        "這不是需要即時資料的問題。請直接回答；若無法理解就請使用者重說，不要呼叫研究工具。",
    };
  }

  return { blocked: false, reason: "" };
}

export async function runVoiceResearchWithTimeout(
  questionValue: unknown,
  titleValue: unknown,
) {
  const question = normalize(questionValue);
  const guard = shouldBlockVoiceResearch(question);

  if (guard.blocked) {
    return {
      ok: false,
      skipped: true,
      fastGuard: true,
      reason: guard.reason,
    };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(
    () => controller.abort(),
    RESEARCH_TIMEOUT_MS,
  );

  try {
    const response = await fetch("/api/research/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        title: normalize(titleValue) || undefined,
      }),
      signal: controller.signal,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "研究工具執行失敗");
    }

    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        timeout: true,
        fastGuard: true,
        reason:
          "即時研究超過10秒，已停止等待。請先簡短回答目前能確定的內容；需要完整研究時再使用Agent交辦。",
      };
    }

    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
