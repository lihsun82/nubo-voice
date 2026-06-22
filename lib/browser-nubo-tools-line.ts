"use client";

import {
  executeNuboBrowserTool,
  geminiFunctionDeclarations as baseDeclarations,
  geminiSystemInstruction as baseInstruction,
  type FunctionCall,
} from "@/lib/browser-nubo-tools";

export type { FunctionCall };
export { executeNuboBrowserTool };

export const geminiSystemInstruction = `${baseInstruction}
桌面應用程式補充：使用者要求開啟LINE或賴時，呼叫open_desktop_app，app參數使用line。
`;

export const geminiFunctionDeclarations = baseDeclarations.map((declaration) =>
  declaration.name === "open_desktop_app"
    ? {
        ...declaration,
        description:
          "開啟固定白名單Windows工具：LINE、計算機、記事本、小畫家、檔案總管、Windows設定或時鐘。",
      }
    : declaration,
);
