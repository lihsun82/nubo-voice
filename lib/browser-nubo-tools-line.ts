"use client";

import {
  executeNuboBrowserTool as executeBaseTool,
  geminiFunctionDeclarations as baseDeclarations,
  geminiSystemInstruction as baseInstruction,
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
  return executeBaseTool(call);
}

export const geminiSystemInstruction = `${baseInstruction}
桌面應用程式補充：Windows桌面版要求開啟LINE或賴時，呼叫open_desktop_app，app參數使用line；使用者明確說手機版、手機或App時，呼叫open_mobile_app，app參數使用line。
桌面關閉補充：使用者要求關閉LINE、賴、計算機、記事本、小畫家、Chrome、Edge或Firefox時，呼叫close_desktop_app。
NUBO喚醒補充：使用者呼叫nubo、叫nubo出來或要求NUBO網頁跳出來時，呼叫show_nubo。
裝置設定補充：使用者要求設定音量、靜音、解除靜音、增加或降低音量、設定螢幕亮度、增加或降低亮度時，呼叫device_setting。
LINE與Windows應用程式只能使用固定白名單；不得執行任意程式路徑或命令。
完整交付規則：使用者要求全文、完整、全部、逐字、完整做好或不要省略時，成果不得出現「以下略過」「以下省略」「其餘略」「未完待續」「待補」等內容。準備寄信時必須把完整正文放入body；不得只放開頭與省略符號。
Agent交辦規則：使用者要求你完整處理一項工作、需要多步驟完成、需要產出長文或目前沒有直接工具可完成時，呼叫delegate_work。系統會搜尋已核准Skill、自動分派Agent並由Validator驗收。已有專用工具的天氣、旅館行情、附近搜尋、YouTube、Gmail與裝置控制仍優先使用專用工具。
能力不足規則：不得直接下載或執行陌生網路程式。找不到Skill時使用delegate_work進行核准能力搜尋與研究備援；涉及寄出、刪除、付款、改價、取消訂單或發布時，仍須等待使用者確認。
等待提示禁用：你正在思考、查找資料、執行工具或跑流程時，不得用語音說「請稍等」「等一下」「我正在處理」「我正在查找」等等待提示。只需要在完成後直接回答。
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
      "將複雜、多步驟、長文、完整交付或目前沒有直接工具的工作，自動分派給已核准的Agent與Skill執行並驗收。",
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
];
