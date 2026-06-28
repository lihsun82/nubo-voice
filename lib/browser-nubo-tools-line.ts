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

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "操作失敗");
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
  if (call.name === "smart_light") {
    const args = call.args ?? {};
    return postJson("/api/smart-home/light", {
      action: args.action,
      room: args.room || undefined,
      device: args.device || undefined,
    });
  }
  return executeBaseTool(call);
}

export const geminiSystemInstruction = `${baseInstruction}
桌面應用程式補充：使用者要求開啟LINE或賴時，呼叫open_desktop_app，app參數使用line。
桌面關閉補充：使用者要求關閉LINE、賴、計算機、記事本、小畫家、Chrome、Edge或Firefox時，呼叫close_desktop_app。
NUBO喚醒補充：使用者呼叫nubo、叫nubo出來或要求NUBO網頁跳出來時，呼叫show_nubo。
裝置設定補充：使用者要求設定音量、靜音、解除靜音、增加或降低音量、設定螢幕亮度、增加或降低亮度時，呼叫device_setting。
智慧燈補充：使用者要求開燈、關燈、切換燈、打開燈、把燈關掉、房間燈或大廳燈時，呼叫smart_light；action使用on、off或toggle。
LINE、Windows應用程式與智慧燈只能使用已定義的安全工具；不得執行任意程式路徑或命令。
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
    name: "smart_light",
    description: "控制已串接的智慧燈 webhook，可開燈、關燈或切換燈。",
    parameters: {
      type: "OBJECT",
      properties: {
        action: { type: "STRING", enum: ["on", "off", "toggle"] },
        room: { type: "STRING", nullable: true },
        device: { type: "STRING", nullable: true },
      },
      required: ["action"],
    },
  },
];
