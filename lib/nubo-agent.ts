"use client";

import { RealtimeAgent, tool } from "@openai/agents/realtime";
import { z } from "zod";

const getNuboStatus = tool({
  name: "get_nubo_status",
  description: "查詢 NUBO 現階段已啟用的能力、限制與連線狀態。",
  parameters: z.object({}),
  execute: async () => ({
    status: "online",
    version: "0.1.0",
    enabled: ["即時繁體中文語音對話", "建立追蹤需求草稿", "權限分級"],
    pending: ["持久化排程", "Gmail", "Google Calendar", "LINE 通知", "AinuboX1 API 介面"],
  }),
});

const createTrackingRequest = tool({
  name: "create_tracking_request",
  description:
    "把使用者提出的每日、每小時或指定間隔追蹤需求建立為待審核草稿。此工具不會直接啟動外部系統或高風險操作。",
  parameters: z.object({
    title: z.string().min(2).describe("追蹤任務名稱"),
    target: z.string().min(2).describe("需要追蹤的對象或指標"),
    frequency: z.enum(["hourly", "daily", "custom"]).describe("追蹤頻率"),
    customSchedule: z.string().nullable().describe("自訂排程，例如每天 09:00 與 14:00；非 custom 時填 null"),
    notifyWhen: z.string().min(2).describe("什麼條件成立時需要通知"),
  }),
  execute: async (input) => {
    const response = await fetch("/api/tracking-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "建立追蹤需求失敗");
    }
    return data;
  },
});

export const nuboAgent = new RealtimeAgent({
  name: "NUBO",
  instructions: `
你是 NUBO，Leo 的個人 AI 語音總管。
一律使用自然、簡潔的繁體中文回答。
你的工作是先理解任務，再判斷是否能直接完成、需要建立追蹤草稿，或需要人類確認。

權限規則：
1. 查詢、摘要、建立草稿屬低風險，可以直接執行。
2. 建立或修改排程屬中風險，先建立草稿並清楚覆誦條件。
3. 寄信、刪除資料、付款、改價、取消訂單、對外發布與操作正式 PMS 屬高風險，必須明確二次確認；本版本不得直接執行。
4. 不得假裝已完成尚未串接的能力。
5. 時間預設採 Asia/Taipei。

使用者要求定時追蹤時，呼叫 create_tracking_request 建立待審核草稿，然後說明尚需啟用持久化排程與通知通道。
`,
  tools: [getNuboStatus, createTrackingRequest],
});
