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
  return executeBaseTool(call);
}

export const geminiSystemInstruction = `${baseInstruction}
桌面應用程式補充：使用者要求開啟LINE或賴時，呼叫open_desktop_app，app參數使用line。
裝置設定補充：使用者要求設定音量、靜音、解除靜音、增加或降低音量、設定螢幕亮度、增加或降低亮度時，呼叫device_setting。
LINE與Windows應用程式只能使用固定白名單；不得執行任意程式路徑或命令。
`;

export const geminiFunctionDeclarations = [
  ...baseDeclarations.map((declaration) =>
    declaration.name === "open_desktop_app"
      ? {
          ...declaration,
          description:
            "開啟固定白名單Windows工具：LINE、計算機、記事本、小畫家、檔案總管、Windows設定或時鐘。",
        }
      : declaration,
  ),
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
];
