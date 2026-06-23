import { z } from "zod";
import { generateWithFallback } from "@/lib/ai-engine";

const remoteIntentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("help") }),
  z.object({ type: z.literal("status") }),
  z.object({
    type: z.literal("youtube"),
    query: z.string().min(1).max(300),
  }),
  z.object({
    type: z.literal("open_app"),
    app: z.string().min(1).max(100),
  }),
  z.object({
    type: z.literal("open_website"),
    target: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal("audio"),
    action: z.enum(["set", "increase", "decrease", "mute", "unmute", "status"]),
    value: z.number().min(0).max(100).optional(),
  }),
  z.object({
    type: z.literal("brightness"),
    action: z.enum(["set", "increase", "decrease", "status"]),
    value: z.number().min(0).max(100).optional(),
  }),
  z.object({
    type: z.literal("research"),
    question: z.string().min(3).max(5000),
  }),
  z.object({
    type: z.literal("gmail_search"),
    query: z.string().min(1).max(500),
    maxResults: z.number().int().min(1).max(10).optional(),
  }),
  z.object({ type: z.literal("list_tasks") }),
  z.object({
    type: z.literal("blocked"),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal("unknown"),
    reason: z.string().min(1).max(500),
  }),
]);

type RemoteIntent = z.infer<typeof remoteIntentSchema>;

const HELP_TEXT = [
  "NUBO LINE遠端控制已上線。",
  "",
  "目前可用：",
  "• 播放音樂：播放 周杰倫 晴天",
  "• 開啟程式：開啟LINE／記事本／計算機／檔案總管",
  "• 開啟網站：開啟Gmail／Google／網址",
  "• 音量：音量50／提高音量10／靜音／解除靜音",
  "• 亮度：亮度60／降低亮度10",
  "• 研究：研究台南旅館最新房價趨勢",
  "• 查信：查信 newer_than:1d",
  "• 任務：列出任務",
  "• 狀態：NUBO狀態",
  "",
  "安全限制：不執行任意CMD或PowerShell、不刪除檔案、不關機、不付款、不下單、不直接寄信。",
].join("\n");

function stripNuboPrefix(text: string) {
  return text
    .trim()
    .replace(/^nubo\s*[,，:：-]?\s*/i, "")
    .trim();
}

function numberFrom(text: string, fallback = 10) {
  const match = text.match(/(\d{1,3})/);
  if (!match) return fallback;
  return Math.max(0, Math.min(100, Number(match[1])));
}

function fastClassify(rawText: string): RemoteIntent | null {
  const text = stripNuboPrefix(rawText);
  const lower = text.toLowerCase();

  if (/^(說明|幫助|help|功能|可以做什麼|指令)$/.test(lower)) {
    return { type: "help" };
  }
  if (/^(狀態|目前狀態|系統狀態|在線嗎|還在嗎)$/.test(lower)) {
    return { type: "status" };
  }
  if (/^(列出任務|任務列表|有哪些任務|查看任務)$/.test(lower)) {
    return { type: "list_tasks" };
  }

  if (/解除靜音|取消靜音/.test(text)) {
    return { type: "audio", action: "unmute" };
  }
  if (/靜音/.test(text)) {
    return { type: "audio", action: "mute" };
  }
  if (/目前音量|音量多少|查詢音量/.test(text)) {
    return { type: "audio", action: "status" };
  }
  if (/音量/.test(text) && /(提高|增加|大聲|調高|加大)/.test(text)) {
    return { type: "audio", action: "increase", value: numberFrom(text) };
  }
  if (/音量/.test(text) && /(降低|減少|小聲|調低|減小)/.test(text)) {
    return { type: "audio", action: "decrease", value: numberFrom(text) };
  }
  if (/音量/.test(text) && /\d{1,3}/.test(text)) {
    return { type: "audio", action: "set", value: numberFrom(text) };
  }

  if (/目前亮度|亮度多少|查詢亮度/.test(text)) {
    return { type: "brightness", action: "status" };
  }
  if (/亮度/.test(text) && /(提高|增加|調高|變亮)/.test(text)) {
    return {
      type: "brightness",
      action: "increase",
      value: numberFrom(text),
    };
  }
  if (/亮度/.test(text) && /(降低|減少|調低|變暗)/.test(text)) {
    return {
      type: "brightness",
      action: "decrease",
      value: numberFrom(text),
    };
  }
  if (/亮度/.test(text) && /\d{1,3}/.test(text)) {
    return { type: "brightness", action: "set", value: numberFrom(text) };
  }

  const youtubeMatch = text.match(
    /^(?:幫我)?(?:播放|放|聽)(?:一下)?(?:youtube(?:\s*music)?|音樂|歌曲|歌)?\s*[：:]?\s*(.+)$/i,
  );
  if (youtubeMatch?.[1]?.trim()) {
    return { type: "youtube", query: youtubeMatch[1].trim() };
  }

  const gmailMatch = text.match(
    /^(?:幫我)?(?:查信|搜尋郵件|搜尋信件|找信)\s*[：:]?\s*(.*)$/i,
  );
  if (gmailMatch) {
    return {
      type: "gmail_search",
      query: gmailMatch[1].trim() || "in:inbox newer_than:7d",
      maxResults: 5,
    };
  }

  const appMatch = text.match(
    /^(?:幫我)?(?:開啟|打開|啟動)\s*(LINE|賴|計算機|記事本|小畫家|檔案總管|設定|Windows設定|時鐘)$/i,
  );
  if (appMatch?.[1]) {
    return { type: "open_app", app: appMatch[1] };
  }

  const websiteMatch = text.match(
    /^(?:幫我)?(?:開啟|打開)\s*(Facebook|FB|臉書|Google|Gmail|YouTube|YouTube Music|ChatGPT|地圖|日曆|https?:\/\/\S+|[a-z0-9.-]+\.[a-z]{2,}\S*)$/i,
  );
  if (websiteMatch?.[1]) {
    return { type: "open_website", target: websiteMatch[1] };
  }

  const researchMatch = text.match(
    /^(?:幫我)?(?:研究|查資料|搜尋資料|調查|分析|幫我查)\s*[：:]?\s*(.+)$/i,
  );
  if (researchMatch?.[1]?.trim()) {
    return { type: "research", question: researchMatch[1].trim() };
  }

  const blockedPatterns = [
    /(?:刪除|清空|格式化).*(?:檔案|資料|硬碟|信件|郵件)/i,
    /(?:關機|重新開機|重啟電腦|登出Windows)/i,
    /(?:付款|匯款|轉帳|下單|購買|取消訂單)/i,
    /(?:powershell|cmd|命令提示字元|執行命令|執行指令碼|shell)/i,
    /(?:寄出|發送).*(?:郵件|email|e-mail|信件)/i,
  ];
  if (blockedPatterns.some((pattern) => pattern.test(text))) {
    return {
      type: "blocked",
      reason: "此操作屬於高風險或任意系統操作，LINE遠端模式不會自動執行。",
    };
  }

  return null;
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? text;
  const object = source.match(/\{[\s\S]*\}/)?.[0];
  if (!object) throw new Error("AI未回傳可解析的指令JSON");
  return JSON.parse(object);
}

async function classifyWithAi(text: string): Promise<RemoteIntent> {
  const taipeiTime = new Date().toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
  });
  const prompt = `
你是NUBO LINE遠端指令分類器。只輸出一個JSON物件，不要Markdown、不要說明。
現在台北時間：${taipeiTime}

允許的type與欄位：
- {"type":"help"}
- {"type":"status"}
- {"type":"youtube","query":"歌曲或影片"}
- {"type":"open_app","app":"LINE、計算機、記事本、小畫家、檔案總管、設定、時鐘之一"}
- {"type":"open_website","target":"網站名稱、網址或搜尋關鍵字"}
- {"type":"audio","action":"set|increase|decrease|mute|unmute|status","value":10}
- {"type":"brightness","action":"set|increase|decrease|status","value":10}
- {"type":"research","question":"研究問題"}
- {"type":"gmail_search","query":"Gmail搜尋語法或自然語言條件","maxResults":5}
- {"type":"list_tasks"}
- {"type":"blocked","reason":"阻擋理由"}
- {"type":"unknown","reason":"目前工具不足"}

安全規則：
1. 刪除檔案、清空資料、關機、重開機、付款、下單、取消訂單、正式寄信、任意CMD、PowerShell、Shell、鍵盤滑鼠自動化，一律blocked。
2. 不得產生任何上述清單以外的type。
3. 模糊但可作為資料研究的要求可用research。
4. 只有查詢Gmail可用gmail_search，不可寄信或刪信。

使用者文字：${text}
`;
  const result = await generateWithFallback(prompt);
  return remoteIntentSchema.parse(extractJson(result.text));
}

async function classifyRemoteText(text: string): Promise<RemoteIntent> {
  const fast = fastClassify(text);
  if (fast) return fast;
  try {
    return await classifyWithAi(text);
  } catch {
    return {
      type: "unknown",
      reason: "我目前無法把這句話對應到安全的電腦操作。請輸入「說明」查看可用指令。",
    };
  }
}

function resolveInternalBaseUrl(requestOrigin: string) {
  return (process.env.NUBO_INTERNAL_URL?.trim() || requestOrigin).replace(/\/$/, "");
}

async function nuboRequest(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = 60_000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.suggestion
          ? `${payload?.error ?? "NUBO操作失敗"}\n${payload.suggestion}`
          : payload?.error ?? `NUBO操作失敗：${response.status}`,
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("NUBO本機操作逾時");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function postJson(baseUrl: string, path: string, body: unknown, timeoutMs?: number) {
  return nuboRequest(
    baseUrl,
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
}

function formatGmailMessages(messages: any[]) {
  if (!messages.length) return "沒有找到符合條件的郵件。";
  return messages
    .slice(0, 5)
    .map((message, index) => {
      const subject = message?.subject || "（無主旨）";
      const from = message?.from || "未知寄件者";
      const date = message?.date || "";
      const snippet = message?.snippet || "";
      return `${index + 1}. ${subject}\n寄件者：${from}${date ? `\n日期：${date}` : ""}${snippet ? `\n摘要：${snippet}` : ""}`;
    })
    .join("\n\n");
}

function formatTasks(tasks: any[]) {
  if (!tasks.length) return "目前沒有任務。";
  return tasks
    .slice(0, 10)
    .map((task, index) => {
      const status = task?.status || "unknown";
      const next = task?.nextRunAt ? `；下次：${task.nextRunAt}` : "";
      return `${index + 1}. ${task?.title || "未命名任務"}（${status}${next}）`;
    })
    .join("\n");
}

async function executeIntent(intent: RemoteIntent, baseUrl: string): Promise<string> {
  if (intent.type === "help") return HELP_TEXT;
  if (intent.type === "status") {
    const providers = await nuboRequest(baseUrl, "/api/providers");
    const ready = Array.isArray(providers?.providers)
      ? providers.providers
          .filter((item: any) => item?.configured)
          .map((item: any) => item.name)
          .join("、")
      : "未知";
    return [
      "NUBO目前在線。",
      `台北時間：${new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`,
      `可用AI引擎：${ready || "尚未設定"}`,
      `語音引擎：${providers?.voiceProvider || "none"}`,
      "LINE遠端控制：已授權",
    ].join("\n");
  }
  if (intent.type === "youtube") {
    const result = await postJson(baseUrl, "/api/youtube/open", {
      query: intent.query,
      service: "youtube_music",
    });
    return result?.message || `已播放：${intent.query}`;
  }
  if (intent.type === "open_app") {
    const result = await postJson(baseUrl, "/api/system/open-app", {
      app: intent.app,
    });
    return `已在家中電腦開啟：${result?.app || intent.app}`;
  }
  if (intent.type === "open_website") {
    const result = await postJson(baseUrl, "/api/system/open-website", {
      target: intent.target,
    });
    return `已在家中電腦開啟：${result?.url || intent.target}`;
  }
  if (intent.type === "audio") {
    const result = await postJson(baseUrl, "/api/device/audio", {
      action: intent.action,
      value: intent.value ?? 10,
    });
    return `音量：${result.volume}%\n靜音：${result.muted ? "是" : "否"}`;
  }
  if (intent.type === "brightness") {
    const result = await postJson(baseUrl, "/api/device/brightness", {
      action: intent.action,
      value: intent.value ?? 10,
    });
    return `螢幕亮度：${result.brightness}%`;
  }
  if (intent.type === "research") {
    const result = await postJson(
      baseUrl,
      "/api/research/run",
      { question: intent.question, title: `LINE研究：${intent.question.slice(0, 50)}` },
      180_000,
    );
    return `${result.result}\n\n完整結果已存入NUBO收件匣。`;
  }
  if (intent.type === "gmail_search") {
    const result = await postJson(baseUrl, "/api/gmail/search", {
      query: intent.query,
      maxResults: intent.maxResults ?? 5,
    });
    return formatGmailMessages(Array.isArray(result?.messages) ? result.messages : []);
  }
  if (intent.type === "list_tasks") {
    const result = await nuboRequest(baseUrl, "/api/tasks");
    return formatTasks(Array.isArray(result?.tasks) ? result.tasks : []);
  }
  if (intent.type === "blocked") {
    return `基於安全限制，這項操作沒有執行。\n${intent.reason}`;
  }
  return `${intent.reason}\n\n輸入「說明」查看目前支援的LINE遠端指令。`;
}

export async function executeLineRemoteText(
  text: string,
  requestOrigin: string,
): Promise<string> {
  const intent = await classifyRemoteText(text);
  const baseUrl = resolveInternalBaseUrl(requestOrigin);
  try {
    return await executeIntent(intent, baseUrl);
  } catch (error) {
    return `NUBO執行失敗：${error instanceof Error ? error.message : "未知錯誤"}`;
  }
}

export function lineRemoteHelpText() {
  return HELP_TEXT;
}
