"use client";

import {
  executeNuboBrowserTool as executeBaseTool,
  geminiFunctionDeclarations as baseDeclarations,
  type FunctionCall,
} from "@/lib/browser-nubo-tools";

export type { FunctionCall };

async function postSetting(
  target: "audio" | "brightness",
  action: string,
  value = 10,
) {
  const response = await fetch(`/api/device/${target}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, value }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "裝置設定失敗");
  return payload;
}

async function delegateWork(args: Record<string, unknown>) {
  const response = await fetch("/api/agents/delegate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: String(args.title ?? "NUBO交辦工作"),
      instruction: String(args.instruction ?? ""),
      mode: args.mode === "plan" ? "plan" : "execute",
      requireComplete: args.requireComplete !== false,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "NUBO Agent交辦失敗");
  return payload;
}

async function delegatedWorkStatus(args: Record<string, unknown>) {
  const runId = String(args.runId ?? "").trim();
  const requestedLimit = Number(args.limit ?? 5);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 10)
    : 5;
  const query = runId
    ? `?id=${encodeURIComponent(runId)}`
    : `?limit=${limit}`;
  const response = await fetch(
    `/api/agents/delegate${query}`,
    { cache: "no-store" },
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error ?? "讀取NUBO Agent交辦紀錄失敗",
    );
  }
  return payload;
}

export async function executeNuboBrowserTool(call: FunctionCall) {
  if (call.name === "device_setting") {
    const args = call.args ?? {};
    const target = args.target === "brightness" ? "brightness" : "audio";
    return postSetting(
      target,
      String(args.action ?? "status"),
      Number(args.value ?? 10),
    );
  }
  if (call.name === "delegate_work") {
    return delegateWork(call.args ?? {});
  }
  if (call.name === "delegated_work_status") {
    return delegatedWorkStatus(call.args ?? {});
  }
  return executeBaseTool(call);
}

/*
 * NUBO_MOBILE_FAST_PROMPT_V1
 * Gemini Live 每次建立連線都要傳送完整系統指令。
 * 保留所有安全與路由規則，但移除重複說明，降低手機首輪延遲。
 */
export const geminiSystemInstruction = `
你是NUBO，Leo的個人AI語音總管。只用自然、簡潔的繁體中文回答，不要朗讀冗長內容。

快速路由：
1. 一般聊天、常識與簡單建議直接回答；只有使用者明確要求最新資料、查證、多來源比較或深入研究時才用research_now。
2. 時間與相對日期用get_current_time；天氣用get_weather；附近店家用search_nearby；條件完整的旅行規劃用travel_plan。
3. 旅館房價與競品行情用hotel_market_report；明確要求重新抓取時才用hotel_market_refresh。
4. 音樂或影片用open_youtube。手機App用open_mobile_app；網站用open_website；桌機白名單程式用open_desktop_app或close_desktop_app。
5. 查信先用gmail_search，必要時gmail_read。建立草稿用gmail_create_draft。
6. 正式寄信必須先用gmail_prepare_send；只有使用者再說「確認寄出」「確定寄出」「寄出吧」或「可以寄」時才用gmail_confirm_send。不得跳過確認。
7. 排程工作用create_task、list_tasks與task_action。複雜、多步驟、長文、完整交付或沒有直接工具的工作用delegate_work；查交辦進度或成果用delegated_work_status。
8. 音量與亮度用device_setting。已有專用工具時不得改用research_now或delegate_work。

交付規則：
- 使用者要求全文、完整、全部、逐字或不得省略時，禁止「以下略過」「以下省略」「其餘略」「未完待續」「待補」。
- delegate_work完成後只簡短回報已完成、已驗收並已保存；不要用語音朗讀整篇長文。
- 不得捏造工具結果，不得宣稱失敗或尚未串接的操作已完成。
- 執行工具或思考期間禁止說「請稍等」「等一下」「我正在處理」「我正在查找」；完成後直接回答。
- 付款、轉帳、刪除、改價、取消訂單、發布與正式PMS操作必須再次確認。
- 只能開啟固定白名單或HTTP/HTTPS網址，不得執行任意程式、路徑或陌生命令。
`;

export const geminiFunctionDeclarations = [
  ...baseDeclarations.map((declaration) => {
    if (declaration.name === "open_desktop_app") {
      return {
        ...declaration,
        description:
          "開啟固定白名單Windows工具：LINE、計算機、記事本、小畫家、檔案總管、Windows設定或時鐘。",
      };
    }
    if (declaration.name === "close_desktop_app") {
      return {
        ...declaration,
        description:
          "關閉固定白名單Windows程式視窗：LINE、計算機、記事本、小畫家、Chrome、Edge或Firefox。",
      };
    }
    return declaration;
  }),
  {
    name: "device_setting",
    description: "調整Windows音量、靜音狀態或內建螢幕亮度。",
    parameters: {
      type: "OBJECT",
      properties: {
        target: { type: "STRING", enum: ["audio", "brightness"] },
        action: {
          type: "STRING",
          enum: ["set", "increase", "decrease", "mute", "unmute", "status"],
        },
        value: { type: "NUMBER" },
      },
      required: ["target", "action"],
    },
  },
  {
    name: "delegate_work",
    description:
      "將複雜、多步驟、長文、完整交付或目前沒有直接工具的工作，自動分派給已核准的Agent與Skill執行並驗收；完成後會保存紀錄並送入NUBO收件匣。",
    parameters: {
      type: "OBJECT",
      properties: {
        title: {
          type: "STRING",
          description: "簡短任務名稱。",
        },
        instruction: {
          type: "STRING",
          description: "保留使用者全部要求、格式、對象、限制與完成標準的完整交辦內容。",
        },
        mode: {
          type: "STRING",
          enum: ["plan", "execute"],
          description: "預設execute直接完成；只有使用者要求先規劃時才用plan。",
        },
        requireComplete: {
          type: "BOOLEAN",
          description: "是否強制完整性驗收，預設true。",
        },
      },
      required: ["title", "instruction"],
    },
  },
  {
    name: "delegated_work_status",
    description:
      "查詢最近的NUBO Agent交辦紀錄、執行狀態、成果摘要或指定runId的完整成果。",
    parameters: {
      type: "OBJECT",
      properties: {
        runId: {
          type: "STRING",
          nullable: true,
          description: "指定交辦紀錄ID；不知道時留空查最近紀錄。",
        },
        limit: {
          type: "NUMBER",
          nullable: true,
          description: "查詢最近幾筆，預設5，最多10。",
        },
      },
    },
  },
];
