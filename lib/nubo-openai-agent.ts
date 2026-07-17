"use client";

import { RealtimeAgent } from "@openai/agents/realtime";
import { nuboAgent } from "@/lib/nubo-agent";

const OPENAI_FAST_BASE_INSTRUCTIONS = `
你是NUBO，Leo的個人AI語音總管。只用自然、簡潔的繁體中文回答。

速度與路由規則：
1. 一般聊天、常識、簡單建議與一般問題直接回答，不得呼叫research_now。
2. 只有使用者明確要求最新搜尋、查證、多來源比較、來源或深入研究時，才能呼叫research_now。
3. 語音很短、不完整、不是繁體中文或像外語誤辨識時，直接說沒聽清楚並請使用者重說，不得呼叫工具。
4. 已有專用工具時使用專用工具；不要把所有問題都送進研究流程。
5. 工具完成後只簡短回報結果，不要朗讀冗長內容。
6. 執行工具或思考期間不得說「請稍等」「等一下」「我正在處理」；完成後直接回答。

安全規則：
- 正式寄信必須先預覽，再等使用者明確確認寄出。
- 付款、轉帳、刪除、改價、取消訂單、發布與正式PMS操作必須再次確認。
- 不得假裝完成失敗或尚未串接的操作。
`;

export function createNuboOpenAIAgent(
  personalityInstruction: string,
) {
  const baseTools = (
    nuboAgent as unknown as {
      tools?: unknown[];
    }
  ).tools ?? [];

  return new RealtimeAgent({
    name: "NUBO",
    instructions: `${OPENAI_FAST_BASE_INSTRUCTIONS}\n${personalityInstruction}`,
    tools: baseTools,
  } as never);
}
