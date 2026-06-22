"use client";

import { RealtimeAgent, tool } from "@openai/agents/realtime";
import { z } from "zod";

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "NUBO工具執行失敗");
  return data;
}

const getNuboStatus = tool({
  name: "get_nubo_status",
  description: "查詢NUBO目前能力、台灣時間與安全限制。",
  parameters: z.object({}),
  execute: async () => ({
    status: "online",
    version: "0.5.0",
    taipeiTime: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
    enabled: [
      "即時繁體中文語音",
      "研究與解方搜尋",
      "YouTube與YouTube Music自動播放",
      "自動開啟Facebook、Google、Gmail與任意安全網址",
      "開啟計算機、記事本、小畫家、檔案總管、設定與時鐘",
      "Gmail搜尋、讀取、草稿與確認寄送",
      "一次性與週期任務",
      "Gmail來源摘要與白名單交付",
    ],
    protected: ["付款", "刪除", "改價", "取消訂單", "正式PMS操作"],
  }),
});

const createTask = tool({
  name: "create_task",
  description:
    "建立提醒、報告、研究、定期摘要或Gmail摘要任務，也可設定Gmail草稿或白名單寄送。",
  parameters: z.object({
    title: z.string().min(2),
    kind: z.enum(["reminder", "report", "research", "brief"]),
    instruction: z.string().min(2),
    condition: z.string().nullable(),
    scheduleType: z.enum(["once", "hourly", "daily", "interval"]),
    firstRunAt: z.string().nullable(),
    intervalMinutes: z.number().int().min(5).max(10080).nullable(),
    sourceType: z.enum(["none", "gmail"]).default("none"),
    gmailQuery: z.string().nullable(),
    includeEmailBody: z.boolean().default(false),
    deliveryType: z.enum(["inbox", "gmail_draft", "gmail_send"]).default("inbox"),
    deliveryTo: z.string().nullable(),
    deliverySubject: z.string().nullable(),
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
        source:
          input.sourceType === "gmail"
            ? {
                type: "gmail",
                query: input.gmailQuery || "in:inbox newer_than:1d",
                maxResults: 10,
                includeBody: input.includeEmailBody,
              }
            : { type: "none" },
        delivery:
          input.deliveryType === "inbox"
            ? { type: "inbox" }
            : {
                type: input.deliveryType,
                to: input.deliveryTo,
                subject: input.deliverySubject || input.title,
              },
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
  description: "列出任務、資料來源、交付方式與下一次執行時間。",
  parameters: z.object({}),
  execute: async () => {
    const data = await jsonRequest("/api/tasks", { cache: "no-store" });
    return {
      tasks: data.tasks.map((task: Record<string, unknown>) => ({
        id: task.id,
        title: task.title,
        kind: task.kind,
        status: task.status,
        source: task.source,
        delivery: task.delivery,
        nextRunAt: task.nextRunAt,
        lastError: task.lastError,
      })),
    };
  },
});

const taskAction = tool({
  name: "task_action",
  description: "立即執行、暫停或恢復既有任務。",
  parameters: z.object({
    id: z.string().min(1),
    action: z.enum(["run", "pause", "resume"]),
  }),
  execute: async ({ id, action }) =>
    jsonRequest("/api/tasks/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    }),
});

const researchNow = tool({
  name: "research_now",
  description: "立即搜尋資料、比較方案、找出限制與可執行解方，並存入NUBO收件匣。",
  parameters: z.object({
    question: z.string().min(3),
    title: z.string().min(2).nullable(),
  }),
  execute: async ({ question, title }) =>
    jsonRequest("/api/research/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, title: title ?? undefined }),
    }),
});

const openYouTube = tool({
  name: "open_youtube",
  description: "依歌曲、歌手、影片或主題搜尋並在NUBO專用播放器直接自動播放。",
  parameters: z.object({
    query: z.string().min(1),
    service: z.enum(["youtube", "youtube_music"]).default("youtube_music"),
  }),
  execute: async ({ query, service }) =>
    jsonRequest("/api/youtube/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, service }),
    }),
});

const openWebsite = tool({
  name: "open_website",
  description:
    "開啟Facebook、Google、Gmail、YouTube、Google Maps、Calendar、任意HTTP/HTTPS網址，或搜尋關鍵字。",
  parameters: z.object({
    target: z.string().min(1),
  }),
  execute: async ({ target }) =>
    jsonRequest("/api/system/open-website", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    }),
});

const openDesktopApp = tool({
  name: "open_desktop_app",
  description:
    "開啟安全白名單內的Windows工具：計算機、記事本、小畫家、檔案總管、設定或時鐘。",
  parameters: z.object({
    app: z.string().min(1),
  }),
  execute: async ({ app }) =>
    jsonRequest("/api/system/open-app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app }),
    }),
});

const gmailStatus = tool({
  name: "gmail_status",
  description: "檢查Gmail是否已設定並完成OAuth連接。",
  parameters: z.object({}),
  execute: async () => jsonRequest("/api/gmail/status", { cache: "no-store" }),
});

const gmailSearch = tool({
  name: "gmail_search",
  description: "使用Gmail搜尋語法查找郵件並回傳主旨、寄件者、日期與摘要。",
  parameters: z.object({
    query: z.string().min(1),
    maxResults: z.number().int().min(1).max(20).default(10),
  }),
  execute: async ({ query, maxResults }) =>
    jsonRequest("/api/gmail/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, maxResults }),
    }),
});

const gmailRead = tool({
  name: "gmail_read",
  description: "讀取指定Gmail郵件的完整內容。郵件ID應先由gmail_search取得。",
  parameters: z.object({ id: z.string().min(1) }),
  execute: async ({ id }) =>
    jsonRequest("/api/gmail/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }),
});

const gmailCreateDraft = tool({
  name: "gmail_create_draft",
  description: "在Gmail建立可供使用者審閱的郵件草稿，不會直接寄出。",
  parameters: z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
  execute: async (input) =>
    jsonRequest("/api/gmail/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
});

const gmailPrepareSend = tool({
  name: "gmail_prepare_send",
  description:
    "準備寄送郵件並回傳預覽與pendingId。必須覆誦收件者、主旨與內容摘要，等待使用者明確說確認寄出。",
  parameters: z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
  execute: async (input) =>
    jsonRequest("/api/gmail/prepare-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
});

const gmailConfirmSend = tool({
  name: "gmail_confirm_send",
  description:
    "只有使用者在看到或聽到預覽後明確說確認寄出，才可用pendingId正式寄信。",
  parameters: z.object({ pendingId: z.string().uuid() }),
  execute: async ({ pendingId }) =>
    jsonRequest("/api/gmail/confirm-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingId }),
    }),
});

export const nuboAgent = new RealtimeAgent({
  name: "NUBO",
  instructions: `
你是NUBO，Leo的個人AI語音總管。使用自然、簡潔的繁體中文。

工作原則：
1. 使用者提出問題或要找解方時，主動呼叫research_now，不要只給一般性建議。
2. 使用者想聽音樂或看影片時，呼叫open_youtube並直接播放，不要只開搜尋頁。
3. 使用者要開啟Facebook、Google、Gmail、網站或網址時，呼叫open_website。
4. 使用者要開啟計算機、記事本、小畫家、檔案總管、設定或時鐘時，呼叫open_desktop_app。
5. 使用者問郵件時，先用gmail_search，再視需要用gmail_read；摘要時不得捏造內容。
6. 使用者要寄信時，可直接建立草稿；若要正式寄出，先呼叫gmail_prepare_send並完整覆誦預覽。只有下一句明確表示「確認寄出」才呼叫gmail_confirm_send。
7. 使用者要求每天或每小時自動整理Gmail時，建立sourceType=gmail的brief任務。
8. 使用者要求把排程結果寄信時，設定deliveryType。gmail_send只有系統白名單允許才會自動寄出，否則會自動改成草稿。
9. 時區固定Asia/Taipei。具體時間使用含+08:00的ISO 8601。
10. 使用者說現在就做時，建立任務後再呼叫task_action的run。

安全規則：
- 研究、讀信、摘要、建立草稿、播放YouTube、開啟HTTP/HTTPS網頁與白名單Windows工具可直接執行。
- open_website不可開啟file、shell、javascript或其他非HTTP/HTTPS協定。
- open_desktop_app不可執行任意程式或任意命令，只能使用預先列出的Windows工具。
- 正式寄信必須兩階段確認；排程自動寄送只允許環境白名單。
- 付款、轉帳、刪除、改價、取消訂單、正式PMS操作不得自行執行。
- 不得假裝完成尚未串接或失敗的操作。
`,
  tools: [
    getNuboStatus,
    createTask,
    listTasks,
    taskAction,
    researchNow,
    openYouTube,
    openWebsite,
    openDesktopApp,
    gmailStatus,
    gmailSearch,
    gmailRead,
    gmailCreateDraft,
    gmailPrepareSend,
    gmailConfirmSend,
  ],
});
