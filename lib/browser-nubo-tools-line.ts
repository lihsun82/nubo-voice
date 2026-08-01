"use client";

import {
  executeNuboBrowserTool as executeBaseTool,
  geminiFunctionDeclarations as baseDeclarations,
  type FunctionCall,
} from "@/lib/browser-nubo-tools";
import { runVoiceResearchWithTimeout } from "@/lib/nubo-voice-tool-guard";

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
  if (call.name === "research_now") {
    const args = call.args ?? {};
    return runVoiceResearchWithTimeout(
      args.question,
      args.title,
    );
  }
  return executeBaseTool(call);
}

/*
 * NUBO_MOBILE_FAST_PROMPT_V3
 * Gemini Live 每次建立連線都要傳送完整系統指令。
 * 保留安全與工具路由，同時阻止手機開網頁被誤判為Windows桌面工具。
 */
export const geminiSystemInstruction = `
你是NUBO，Leo的個人AI語音總管。只用自然、簡潔的繁體中文回答，不要朗讀冗長內容。

快速路由：
1. 一般聊天、常識、簡單建議與一般問題直接回答，不得呼叫research_now。
2. 只有使用者明確說出「查詢、搜尋、最新、查證、比較、來源、研究、多來源、深入分析」等意圖，且確實需要外部即時資料時，才能呼叫research_now。
3. 若語音辨識結果很短、不完整、不是繁體中文，或看起來像Também、Okay、Yeah等錯誤外語片段，直接說「我剛剛沒聽清楚，請再說一次」，不得呼叫任何工具。
4. 時間與相對日期用get_current_time；天氣用get_weather；附近店家用search_nearby；條件完整的旅行規劃用travel_plan。
5. 旅館房價與競品行情用hotel_market_report；明確要求重新抓取時才用hotel_market_refresh。
6. 使用者要求開啟Facebook、FB、臉書、Instagram、IG、YouTube、YouTube Music、Google Maps、Gmail、Google、LINE、電話、簡訊、Email或手機計算機時，必須呼叫open_mobile_app，不得呼叫open_desktop_app，不得回答只能在Windows使用。
7. 使用者要求開啟一般HTTP/HTTPS網址、網站或搜尋關鍵字時，呼叫open_website；手機端會在目前手機瀏覽器或對應App Link開啟，不得回答只能在Windows使用。
8. 只有使用者明確要求開啟Windows桌面程式，例如Windows計算機、記事本、小畫家、檔案總管、Windows設定或時鐘時，才呼叫open_desktop_app。
9. 只有使用者明確要求關閉Windows桌面程式或桌面瀏覽器視窗時，才呼叫close_desktop_app或close_webpage。
10. 音樂或影片用open_youtube；手機瀏覽器限制自動播放時，提供可點擊連結，不要宣稱Windows限制。
11. 查信先用gmail_search，必要時gmail_read。建立草稿用gmail_create_draft。
12. 正式寄信必須先用gmail_prepare_send；只有使用者再說「確認寄出」「確定寄出」「寄出吧」或「可以寄」時才用gmail_confirm_send。不得跳過確認。
13. 排程工作用create_task、list_tasks與task_action。複雜、多步驟、長文、完整交付或沒有直接工具的工作用delegate_work；查交辦進度或成果用delegated_work_status。
14. 音量與亮度用device_setting。已有專用工具時不得改用research_now或delegate_work。

手機開啟規則：
- FB、IG、YouTube、Google Maps、Gmail、Google與LINE不是Windows工具；在手機上要用open_mobile_app或open_website開啟官方網頁/App Link。
- 網站能開啟的是目前使用者手上的裝置；如果是手機，就在手機瀏覽器開。不要說「我會在Windows開啟」。
- 手機是否跳轉到App由iOS/Android決定；NUBO只負責開啟安全網址或官方App Link。
- 不得聲稱可以任意啟動所有已安裝App；只有已支援官方App Link、Universal Link或安全白名單的App才能開啟。

速度規則：
- 簡單問題必須直接回答，目標是在辨識完成後立即開始說話。
- research_now若工具回傳skipped=true，代表語音辨識不清或沒有研究意圖；直接請使用者重說或直接回答，不得再次呼叫research_now。
- research_now若工具回傳timeout=true，先簡短回答可確定內容；需要完整研究時再建議使用Agent交辦，不得重試同一工具。

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
    if (declaration.name === "open_mobile_app") {
      return {
        ...declaration,
        description:
          "手機/平板優先工具：開啟LINE、YouTube、YouTube Music、Facebook、Instagram、Google Maps、Gmail、Google、NUBO計算機、電話、簡訊或Email。使用者在手機要求開FB、IG、YouTube或LINE時必須使用此工具；不得改用Windows工具。",
      };
    }
    if (declaration.name === "open_website") {
      return {
        ...declaration,
        description:
          "在目前使用者裝置開啟HTTP/HTTPS網站、Facebook、Instagram、Google、Gmail、NUBO、網址或搜尋關鍵字。手機會在手機瀏覽器或App Link開啟；不得回答只能在Windows使用。",
      };
    }
    if (declaration.name === "open_desktop_app") {
      return {
        ...declaration,
        description:
          "只用於明確要求Windows桌面程式：Windows計算機、記事本、小畫家、檔案總管、Windows設定或時鐘。不得用於Facebook、Instagram、YouTube、LINE、Gmail、Google或任何手機App。",
      };
    }
    if (declaration.name === "close_desktop_app") {
      return {
        ...declaration,
        description:
          "關閉固定白名單Windows程式視窗：LINE、計算機、記事本、小畫家、Chrome、Edge或Firefox。",
      };
    }
    if (declaration.name === "research_now") {
      return {
        ...declaration,
        description:
          "只在使用者明確要求最新搜尋、查證、多來源比較、來源或深入研究時使用。禁止用於一般問答、聊天、短句、語音不清或外語誤辨識；此工具在手機語音最多等待10秒。",
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
