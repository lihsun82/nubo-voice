"use client";

export type FunctionCall = {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
};

export const geminiSystemInstruction = `
你是NUBO，Leo的個人AI語音總管。一律使用自然、簡潔的繁體中文。

工作原則：
1. 使用者提出問題或要找解方時，主動呼叫research_now，不要只給一般性建議。
2. 使用者想聽音樂或看影片時，呼叫open_youtube並直接播放，不要只開搜尋頁。
3. 使用者要開啟Facebook、Google、Gmail、網站或網址時，呼叫open_website。
4. 使用者要關閉Facebook、Gmail、YouTube、Chrome、Edge或瀏覽器視窗時，呼叫close_webpage。
5. 使用者要開啟計算機、記事本、小畫家、檔案總管、設定或時鐘時，呼叫open_desktop_app。
6. 使用者問郵件時，先用gmail_search，再視需要用gmail_read；摘要時不得捏造內容。
7. 使用者要寄信時，可以建立草稿。若要正式寄出，先呼叫gmail_prepare_send並覆誦收件者、主旨與內容摘要。只有下一句明確說確認寄出，才呼叫gmail_confirm_send。
8. 使用者要求每天或每小時自動整理Gmail時，建立sourceType=gmail的brief任務。
9. 使用者要求排程結果寄信時設定deliveryType。gmail_send只有環境白名單允許才會自動寄出，否則建立草稿。
10. 時區固定Asia/Taipei，具體時間使用含+08:00的ISO 8601。
11. 使用者說現在就做時，建立任務後再呼叫task_action的run。

安全規則：
- 研究、讀信、摘要、建立草稿、播放YouTube、開啟網頁、關閉瀏覽器視窗與白名單Windows工具可直接執行。
- open_website只允許HTTP與HTTPS；open_desktop_app只允許預先列出的Windows工具。
- close_webpage只能關閉可見瀏覽器視窗，不能刪檔、不能關機、不能執行任意命令。
- 正式寄信必須兩階段確認；排程自動寄送只允許環境白名單。
- 付款、轉帳、刪除、改價、取消訂單、正式PMS操作不得自行執行。
- 不得假裝完成尚未串接或失敗的操作。
`;

export const geminiFunctionDeclarations = [
  {
    name: "create_task",
    description: "建立提醒、報告、研究、Gmail摘要或定期交付工作流。",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        kind: { type: "STRING", enum: ["reminder", "report", "research", "brief"] },
        instruction: { type: "STRING" },
        condition: { type: "STRING", nullable: true },
        scheduleType: { type: "STRING", enum: ["once", "hourly", "daily", "interval"] },
        firstRunAt: { type: "STRING", nullable: true },
        intervalMinutes: { type: "NUMBER", nullable: true },
        sourceType: { type: "STRING", enum: ["none", "gmail"] },
        gmailQuery: { type: "STRING", nullable: true },
        includeEmailBody: { type: "BOOLEAN" },
        deliveryType: { type: "STRING", enum: ["inbox", "gmail_draft", "gmail_send"] },
        deliveryTo: { type: "STRING", nullable: true },
        deliverySubject: { type: "STRING", nullable: true },
      },
      required: ["title", "kind", "instruction", "scheduleType", "sourceType", "deliveryType"],
    },
  },
  {
    name: "list_tasks",
    description: "列出任務、來源、交付方式與下一次執行時間。",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "task_action",
    description: "立即執行、暫停或恢復指定任務。",
    parameters: {
      type: "OBJECT",
      properties: {
        id: { type: "STRING" },
        action: { type: "STRING", enum: ["run", "pause", "resume"] },
      },
      required: ["id", "action"],
    },
  },
  {
    name: "research_now",
    description: "立即搜尋資料、比較方案、找出限制與可執行解方。",
    parameters: {
      type: "OBJECT",
      properties: {
        question: { type: "STRING" },
        title: { type: "STRING", nullable: true },
      },
      required: ["question"],
    },
  },
  {
    name: "open_youtube",
    description: "搜尋歌曲或影片並在NUBO專用播放器直接自動播放。",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING" },
        service: { type: "STRING", enum: ["youtube", "youtube_music"] },
      },
      required: ["query", "service"],
    },
  },
  {
    name: "open_website",
    description: "開啟Facebook、Google、Gmail、任意HTTP/HTTPS網址或搜尋關鍵字。",
    parameters: {
      type: "OBJECT",
      properties: { target: { type: "STRING" } },
      required: ["target"],
    },
  },
  {
    name: "close_webpage",
    description: "關閉可見瀏覽器視窗，例如Facebook、Gmail、YouTube、Chrome、Edge或瀏覽器。",
    parameters: {
      type: "OBJECT",
      properties: { target: { type: "STRING" } },
      required: ["target"],
    },
  },
  {
    name: "open_desktop_app",
    description: "開啟安全白名單內的Windows工具，例如計算機、記事本、小畫家、檔案總管、設定或時鐘。",
    parameters: {
      type: "OBJECT",
      properties: { app: { type: "STRING" } },
      required: ["app"],
    },
  },
  {
    name: "gmail_status",
    description: "檢查Gmail是否已完成OAuth連接。",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "gmail_search",
    description: "以Gmail搜尋語法搜尋郵件。",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING" },
        maxResults: { type: "NUMBER" },
      },
      required: ["query"],
    },
  },
  {
    name: "gmail_read",
    description: "讀取指定郵件的完整內容。",
    parameters: {
      type: "OBJECT",
      properties: { id: { type: "STRING" } },
      required: ["id"],
    },
  },
  {
    name: "gmail_create_draft",
    description: "建立Gmail草稿，不會直接寄出。",
    parameters: {
      type: "OBJECT",
      properties: {
        to: { type: "STRING" },
        subject: { type: "STRING" },
        body: { type: "STRING" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "gmail_prepare_send",
    description: "準備寄送並回傳預覽與pendingId，之後必須等使用者確認。",
    parameters: {
      type: "OBJECT",
      properties: {
        to: { type: "STRING" },
        subject: { type: "STRING" },
        body: { type: "STRING" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "gmail_confirm_send",
    description: "使用者明確說確認寄出後，以pendingId正式寄信。",
    parameters: {
      type: "OBJECT",
      properties: { pendingId: { type: "STRING" } },
      required: ["pendingId"],
    },
  },
];

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "NUBO工具執行失敗");
  return payload;
}

function post(url: string, body: Record<string, unknown>) {
  return requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function executeNuboBrowserTool(call: FunctionCall) {
  const name = call.name ?? "";
  const args = call.args ?? {};

  if (name === "list_tasks") return requestJson("/api/tasks", { cache: "no-store" });
  if (name === "gmail_status") return requestJson("/api/gmail/status", { cache: "no-store" });
  if (name === "task_action") return post("/api/tasks/action", { id: args.id, action: args.action });
  if (name === "research_now") return post("/api/research/run", { question: args.question, title: args.title || undefined });
  if (name === "open_youtube") return post("/api/youtube/open", { query: args.query, service: args.service || "youtube_music" });
  if (name === "open_website") return post("/api/system/open-website", { target: args.target });
  if (name === "close_webpage") return post("/api/system/browser-window", { action: "close", target: args.target || "browser" });
  if (name === "open_desktop_app") return post("/api/system/open-app", { app: args.app });
  if (name === "gmail_search") return post("/api/gmail/search", { query: args.query, maxResults: args.maxResults || 10 });
  if (name === "gmail_read") return post("/api/gmail/read", { id: args.id });
  if (name === "gmail_create_draft") return post("/api/gmail/draft", { to: args.to, subject: args.subject, body: args.body });
  if (name === "gmail_prepare_send") return post("/api/gmail/prepare-send", { to: args.to, subject: args.subject, body: args.body });
  if (name === "gmail_confirm_send") return post("/api/gmail/confirm-send", { pendingId: args.pendingId });

  if (name === "create_task") {
    const source =
      args.sourceType === "gmail"
        ? {
            type: "gmail",
            query: args.gmailQuery || "in:inbox newer_than:1d",
            maxResults: 10,
            includeBody: Boolean(args.includeEmailBody),
          }
        : { type: "none" };
    const delivery =
      args.deliveryType === "gmail_draft" || args.deliveryType === "gmail_send"
        ? {
            type: args.deliveryType,
            to: args.deliveryTo,
            subject: args.deliverySubject || args.title,
          }
        : { type: "inbox" };

    return post("/api/tasks", {
      title: args.title,
      kind: args.kind,
      instruction: args.instruction,
      condition: args.condition || undefined,
      source,
      delivery,
      schedule: {
        type: args.scheduleType,
        runAt: args.firstRunAt || undefined,
        intervalMinutes: args.intervalMinutes || undefined,
        timezone: "Asia/Taipei",
      },
    });
  }

  throw new Error(`不支援的工具：${name}`);
}
