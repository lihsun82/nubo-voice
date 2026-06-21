"use client";

import { RealtimeAgent, tool } from "@openai/agents/realtime";
import { z } from "zod";

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "NUBO 任務中心操作失敗");
  return data;
}

const getNuboStatus = tool({
  name: "get_nubo_status",
  description: "查詢 NUBO 現階段已啟用的能力、限制與台灣時間。",
  parameters: z.object({}),
  execute: async () => ({
    status: "online",
    version: "0.2.0",
    taipeiTime: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
    enabled: [
      "即時繁體中文語音",
      "一次性與週期提醒",
      "AI 報告與文件草稿",
      "網路研究與條件追蹤",
      "每日簡報",
      "任務暫停、恢復與立即執行",
    ],
    protected: ["寄信", "付款", "刪除", "改價", "取消訂單", "正式 PMS 操作"],
  }),
});

const createTask = tool({
  name: "create_task",
  description:
    "建立可執行的低風險任務。reminder 是提醒；report 是不需即時網路的報告或草稿；research 是網路研究或條件追蹤；brief 是定期摘要。",
  parameters: z.object({
    title: z.string().min(2).describe("任務名稱"),
    kind: z.enum(["reminder", "report", "research", "brief"]),
    instruction: z.string().min(2).describe("要直接完成的工作內容"),
    condition: z.string().nullable().describe("只有符合什麼條件才回報；沒有則填 null"),
    scheduleType: z.enum(["once", "hourly", "daily", "interval"]),
    firstRunAt: z
      .string()
      .nullable()
      .describe("第一次執行的 ISO 8601 時間，台灣時間需包含 +08:00；無指定可填 null"),
    intervalMinutes: z
      .number()
      .int()
      .min(5)
      .max(10080)
      .nullable()
      .describe("interval 使用的分鐘數，其他類型填 null"),
  }),
  execute: async (input) =>
    jsonRequest("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        kind: input.kind,
        instruction: input.instruction,
        condition: input.condition ?? undefined,
        schedule: {
          type: input.scheduleType,
          runAt: input.firstRunAt ?? undefined,
          intervalMinutes: input.intervalMinutes ?? undefined,
          timezone: "Asia/Taipei",
        },
      }),
    }),
});

const listTasks = tool({
  name: "list_tasks",
  description: "列出目前任務與下一次執行時間。",
  parameters: z.object({}),
  execute: async () => {
    const data = await jsonRequest("/api/tasks", { cache: "no-store" });
    return {
      tasks: data.tasks.map((task: Record<string, unknown>) => ({
        id: task.id,
        title: task.title,
        kind: task.kind,
        status: task.status,
        nextRunAt: task.nextRunAt,
        lastError: task.lastError,
      })),
    };
  },
});

const taskAction = tool({
  name: "task_action",
  description: "立即執行、暫停或恢復一個既有任務。",
  parameters: z.object({
    id: z.string().min(1).describe("任務 ID；先使用 list_tasks 查詢"),
    action: z.enum(["run", "pause", "resume"]),
  }),
  execute: async ({ id, action }) =>
    jsonRequest("/api/tasks/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    }),
});

export const nuboAgent = new RealtimeAgent({
  name: "NUBO",
  instructions: `
你是 NUBO，Leo 的個人 AI 語音總管。使用自然、簡潔的繁體中文。

你不只回答，也要把明確的低風險工作建立為任務：
- 提醒與待辦：kind=reminder
- 撰寫報告、文案、分析草稿：kind=report
- 查最新資訊、價格或條件成立才回報：kind=research
- 每日／每小時摘要：kind=brief

排程規則：
1. 時區固定 Asia/Taipei。
2. 使用者說出具體時間時，firstRunAt 必須使用含 +08:00 的 ISO 8601 時間。
3. 每小時用 hourly；每天用 daily；固定分鐘間隔用 interval。
4. 建立後覆誦任務名稱、第一次時間、頻率與回報條件。
5. 使用者說「現在就做」時，建立任務後再呼叫 task_action 的 run。

安全規則：
- 研究、摘要、提醒、內部草稿可以建立並執行。
- 寄信、公開發布、刪除、付款、轉帳、改價、取消訂單及正式 PMS 操作不得自行完成；必須說明尚需專用連接器和再次確認。
- 不得假裝已完成未串接的外部行為。
`,
  tools: [getNuboStatus, createTask, listTasks, taskAction],
});
