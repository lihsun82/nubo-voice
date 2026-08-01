"use client";

import {
  executeNuboBrowserTool as executeBaseTool,
  geminiFunctionDeclarations as baseDeclarations,
  type FunctionCall,
} from "@/lib/browser-nubo-tools";
import {
  isNuboMobileRuntime,
  launchNuboPhoneActionV2,
  resolveNuboPhoneActionV2,
  resolveWebsiteTargetAsPhoneApp,
} from "@/lib/nubo-phone-agent-v2";
import { runVoiceResearchWithTimeout } from "@/lib/nubo-voice-tool-guard";

export type { FunctionCall };

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

const weatherCache = new Map<string, CacheEntry>();
const weatherInflight = new Map<string, Promise<unknown>>();
const WEATHER_BROWSER_CACHE_MS = 5 * 60_000;

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

function fastCurrentTime(args: Record<string, unknown>) {
  const requestedTimezone =
    String(args.timezone ?? "Asia/Taipei").trim() ||
    "Asia/Taipei";
  const location = String(args.location ?? "").trim();
  const now = new Date();
  let timezone = requestedTimezone;
  let formatter: Intl.DateTimeFormat;

  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  };

  try {
    formatter = new Intl.DateTimeFormat("zh-TW", options);
  } catch {
    timezone = "Asia/Taipei";
    formatter = new Intl.DateTimeFormat("zh-TW", {
      ...options,
      timeZone: timezone,
    });
  }

  const parts = formatter.formatToParts(now);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return {
    ok: true,
    source: "browser-device-clock",
    location: location || undefined,
    timezone,
    localTime: formatter.format(now),
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}:${part("second")}`,
    weekday: part("weekday"),
  };
}

async function fastWeather(args: Record<string, unknown>) {
  const location = String(args.location ?? "").trim();
  const key = location.replace(/\s+/g, "").toLowerCase() || "__default__";
  const cached = weatherCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const existing = weatherInflight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const query = location
      ? `?location=${encodeURIComponent(location)}`
      : "";
    const response = await fetch(`/api/weather${query}`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "天氣查詢失敗");
    }

    const compact = {
      ok: true,
      source: payload.source,
      requestedLocation: payload.requestedLocation,
      resolvedLocation:
        payload.resolvedLocation?.displayName ??
        payload.resolvedLocation?.name,
      approximate:
        payload.resolvedLocation?.approximate === true,
      current: payload.current,
      today: payload.today,
      tomorrow: payload.tomorrow,
    };

    weatherCache.set(key, {
      value: compact,
      expiresAt: Date.now() + WEATHER_BROWSER_CACHE_MS,
    });
    return compact;
  })().finally(() => {
    weatherInflight.delete(key);
  });

  weatherInflight.set(key, request);
  return request;
}

function normalizePhoneAppName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

async function runDesktopFallbackForPhoneAgent(
  args: Record<string, unknown>,
) {
  const app = normalizePhoneAppName(args.app);
  const query = String(args.query ?? "").trim();

  if (["line", "賴"].includes(app)) {
    return executeBaseTool({
      name: "open_desktop_app",
      args: { app: "line" },
    });
  }

  if (["calculator", "calc", "計算機", "計算器"].includes(app)) {
    return executeBaseTool({
      name: "open_desktop_app",
      args: { app: "calculator" },
    });
  }

  if (["youtube", "yt", "油管", "youtubemusic", "ytmusic", "youtube音樂"].includes(app)) {
    if (query) {
      return executeBaseTool({
        name: "open_youtube",
        args: {
          query,
          service: ["youtubemusic", "ytmusic", "youtube音樂"].includes(app)
            ? "youtube_music"
            : "youtube",
        },
      });
    }
    return executeBaseTool({
      name: "open_website",
      args: {
        target: ["youtubemusic", "ytmusic", "youtube音樂"].includes(app)
          ? "https://music.youtube.com/"
          : "youtube",
      },
    });
  }

  const websiteTarget = (() => {
    if (["facebook", "fb", "臉書"].includes(app)) return query || "facebook";
    if (["instagram", "ig"].includes(app)) return query || "instagram";
    if (["maps", "googlemaps", "地圖", "google地圖", "導航"].includes(app)) {
      return query
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
        : "maps";
    }
    if (["gmail", "googlemail"].includes(app)) return "gmail";
    if (["google", "browser", "chrome", "瀏覽器"].includes(app)) {
      return query || "google";
    }
    if (["spotify", "spotify音樂"].includes(app)) {
      return query
        ? `https://open.spotify.com/search/${encodeURIComponent(query)}`
        : "https://open.spotify.com/";
    }
    return "";
  })();

  if (websiteTarget) {
    return executeBaseTool({
      name: "open_website",
      args: { target: websiteTarget },
    });
  }

  throw new Error("這項手機功能只能在手機上執行。");
}

async function runPhoneAgentV2(call: FunctionCall) {
  const args = call.args ?? {};

  if (call.name === "open_mobile_app") {
    if (!isNuboMobileRuntime()) {
      return runDesktopFallbackForPhoneAgent(args);
    }

    const action = resolveNuboPhoneActionV2(
      args.app,
      args.query,
      args.value,
    );
    return launchNuboPhoneActionV2(action);
  }

  if (!isNuboMobileRuntime()) return null;

  if (call.name === "open_website") {
    const mapped = resolveWebsiteTargetAsPhoneApp(args.target);
    if (!mapped) return null;
    const action = resolveNuboPhoneActionV2(mapped.app, mapped.query);
    return launchNuboPhoneActionV2(action);
  }

  if (call.name === "search_nearby") {
    const query = [
      String(args.query ?? "").trim(),
      String(args.location ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" ");
    const action = resolveNuboPhoneActionV2("maps", query);
    return launchNuboPhoneActionV2(action);
  }

  if (call.name === "open_youtube") {
    const baseResult = await executeBaseTool(call);
    const resultRecord =
      baseResult && typeof baseResult === "object"
        ? (baseResult as Record<string, unknown>)
        : {};
    const directUrl =
      typeof resultRecord.mobileUrl === "string"
        ? resultRecord.mobileUrl
        : String(args.query ?? "").trim();
    const service =
      args.service === "youtube_music"
        ? "youtube_music"
        : "youtube";
    const action = resolveNuboPhoneActionV2(service, directUrl);
    return {
      ...resultRecord,
      ...launchNuboPhoneActionV2(action),
    };
  }

  return null;
}

export async function executeNuboBrowserTool(call: FunctionCall) {
  const phoneAgentResult = await runPhoneAgentV2(call);
  if (phoneAgentResult !== null) return phoneAgentResult;

  if (call.name === "device_setting") {
    const args = call.args ?? {};
    const target = args.target === "brightness" ? "brightness" : "audio";
    return postSetting(
      target,
      String(args.action ?? "status"),
      Number(args.value ?? 10),
    );
  }
  if (call.name === "get_current_time") {
    return fastCurrentTime(call.args ?? {});
  }
  if (call.name === "get_weather") {
    return fastWeather(call.args ?? {});
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
 * NUBO_PHONE_AGENT_V2
 * 即時語音每次建立連線都會傳送完整系統指令。
 * 手機App控制固定走Deep Link；桌機則安全降級至既有Windows或網站控制。
 */
export const geminiSystemInstruction = `
你是NUBO，Leo的個人AI語音總管。只用自然、簡潔的繁體中文回答，不要朗讀冗長內容。

快速路由：
1. 一般聊天、常識、簡單建議與一般問題直接回答，不得呼叫research_now。
2. 只有使用者明確說出「查詢、搜尋、最新、查證、比較、來源、研究、多來源、深入分析」等意圖，且確實需要外部即時資料時，才能呼叫research_now。
3. 若語音辨識結果很短、不完整、不是繁體中文，或看起來像Também、Okay、Yeah等錯誤外語片段，直接說「我剛剛沒聽清楚，請再說一次」，不得呼叫任何工具。
4. 時間與相對日期立即用get_current_time；天氣立即用get_weather；附近店家用search_nearby；條件完整的旅行規劃用travel_plan。時間與天氣工具只呼叫一次，取得結果後立刻簡短回答。
5. 旅館房價與競品行情用hotel_market_report；明確要求重新抓取時才用hotel_market_refresh。
6. NUBO Phone Agent V2：開啟LINE、Facebook、Instagram、Google Maps、Gmail、Google、Spotify、計算機、電話、簡訊或Email時，一律呼叫open_mobile_app。系統會在手機使用App Deep Link，在桌機自動降級為既有Windows或網站控制。
7. 播放歌曲、音樂、YouTube或YouTube Music時呼叫open_youtube；手機會自動交給對應App，桌機維持既有播放器。不得改用open_desktop_app。
8. 任意網站或網址才使用open_website；Facebook、Instagram、地圖、LINE、Gmail與上述白名單App不得優先用open_website。
9. 使用者說導航、帶我去、附近店家、周邊餐廳、咖啡廳、停車場或加油站時使用search_nearby，手機會直接開啟Google Maps。
10. 只有使用者明確指定「電腦」「Windows」「桌機」時，才直接使用open_desktop_app或close_desktop_app。
11. 查信先用gmail_search，必要時gmail_read。建立草稿用gmail_create_draft。
12. 正式寄信必須先用gmail_prepare_send；只有使用者再說「確認寄出」「確定寄出」「寄出吧」或「可以寄」時才用gmail_confirm_send。不得跳過確認。
13. 排程工作用create_task、list_tasks與task_action。複雜、多步驟、長文、完整交付或沒有直接工具的工作用delegate_work；查交辦進度或成果用delegated_work_status。
14. 音量與亮度用device_setting。已有專用工具時不得改用research_now或delegate_work。

速度規則：
- 簡單問題必須直接回答，目標是在辨識完成後立即開始說話。
- 手機App工具完成後只簡短回答「已開啟」，不要再次開啟同一App，也不要補做Windows操作。
- 時間工具在手機本機完成；天氣工具有短期快取。不得為時間或天氣再做第二次搜尋。
- research_now若工具回傳skipped=true，代表語音辨識不清或沒有研究意圖；直接請使用者重說或直接回答，不得再次呼叫research_now。
- research_now若工具回傳timeout=true，先簡短回答可確定內容；需要完整研究時再建議使用Agent交辦，不得重試同一工具。

交付規則：
- 使用者要求全文、完整、全部、逐字或不得省略時，禁止「以下略過」「以下省略」「其餘略」「未完待續」「待補」。
- delegate_work完成後只簡短回報已完成、已驗收並已保存；不要用語音朗讀整篇長文。
- 不得捏造工具結果，不得宣稱失敗或尚未串接的操作已完成。
- 執行工具或思考期間禁止說「請稍等」「等一下」「我正在處理」「我正在查找」；完成後直接回答。
- 付款、轉帳、刪除、改價、取消訂單、發布與正式PMS操作必須再次確認。
- 只能開啟固定白名單、App Deep Link或HTTP/HTTPS網址，不得執行任意程式、路徑或陌生命令。
`;

export const geminiFunctionDeclarations = [
  ...baseDeclarations.map((declaration) => {
    if (declaration.name === "open_mobile_app") {
      return {
        ...declaration,
        description:
          "NUBO Phone Agent V2：跨裝置開啟LINE、Facebook、Instagram、Google Maps、Gmail、Google、Spotify、計算機、電話、簡訊或Email。手機使用App Deep Link；桌機安全降級至既有Windows或網站控制。",
      };
    }
    if (declaration.name === "open_youtube") {
      return {
        ...declaration,
        description:
          "搜尋並播放YouTube或YouTube Music。手機自動交給對應App，桌機維持NUBO播放器。",
      };
    }
    if (declaration.name === "open_website") {
      return {
        ...declaration,
        description:
          "開啟任意HTTP/HTTPS網址或一般網站；白名單手機App應優先使用open_mobile_app。",
      };
    }
    if (declaration.name === "open_desktop_app") {
      return {
        ...declaration,
        description:
          "只在使用者明確指定Windows、電腦或桌機時，開啟固定白名單Windows工具：LINE、計算機、記事本、小畫家、檔案總管、Windows設定或時鐘。",
      };
    }
    if (declaration.name === "close_desktop_app") {
      return {
        ...declaration,
        description:
          "只在使用者明確指定Windows、電腦或桌機時，關閉固定白名單Windows程式視窗：LINE、計算機、記事本、小畫家、Chrome、Edge或Firefox。",
      };
    }
    if (declaration.name === "research_now") {
      return {
        ...declaration,
        description:
          "只在使用者明確要求最新搜尋、查證、多來源比較、來源或深入研究時使用。禁止用於一般問答、聊天、短句、語音不清或外語誤辨識；此工具在手機語音最多等待10秒。",
      };
    }
    if (declaration.name === "get_current_time") {
      return {
        ...declaration,
        description:
          "極速取得目前日期、時間與星期。詢問時間、日期、星期或相對日期時立即使用一次。",
      };
    }
    if (declaration.name === "get_weather") {
      return {
        ...declaration,
        description:
          "極速取得指定地點目前、今天與明天天氣。使用者詢問天氣時立即使用一次，不得改用research_now。",
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