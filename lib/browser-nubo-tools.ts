"use client";

export type FunctionCall = {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
};

const NUBO_PENDING_GMAIL_ID_KEY =
  "nubo_pending_gmail_id_v1";

function savePendingGmailId(
  pendingId: string,
) {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  window.localStorage.setItem(
    NUBO_PENDING_GMAIL_ID_KEY,
    pendingId,
  );
}

function readPendingGmailId() {
  if (
    typeof window === "undefined"
  ) {
    return "";
  }

  return (
    window.localStorage.getItem(
      NUBO_PENDING_GMAIL_ID_KEY,
    ) ?? ""
  ).trim();
}

function clearPendingGmailId() {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  window.localStorage.removeItem(
    NUBO_PENDING_GMAIL_ID_KEY,
  );
}

function normalizeTarget(value: unknown) {
  const raw = String(value ?? "").trim();
  const key = raw.toLowerCase().replace(/\s+/g, "");
  if (key === "ig") return "instagram";
  if (key === "臉書") return "facebook";
  return raw;
}


const mobileWebsiteAliases:
  Record<string, string> = {
    fb: "https://www.facebook.com/",
    facebook:
      "https://www.facebook.com/",
    臉書:
      "https://www.facebook.com/",
    ig:
      "https://www.instagram.com/",
    instagram:
      "https://www.instagram.com/",
    google:
      "https://www.google.com/",
    gmail:
      "https://mail.google.com/",
    youtube:
      "https://www.youtube.com/",
    maps:
      "https://www.google.com/maps/",
    googlemaps:
      "https://www.google.com/maps/",
    地圖:
      "https://www.google.com/maps/",
  };

function isMobileWebClient() {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined"
  ) {
    return false;
  }

  const userAgent =
    navigator.userAgent || "";

  const mobileUserAgent =
    /Android|iPhone|iPad|iPod|Mobile/i
      .test(userAgent);

  const mobilePointer =
    window
      .matchMedia(
        "(pointer: coarse) and (max-width: 1024px)",
      )
      .matches;

  return (
    mobileUserAgent ||
    mobilePointer
  );
}

function resolveClientWebsite(
  target: string,
) {
  const raw = target.trim();

  const key = raw
    .toLowerCase()
    .replace(/\s+/g, "");

  if (
    [
      "nubo",
      "nubovoice",
      "努寶",
    ].includes(key)
  ) {
    return window.location.origin;
  }

  const alias =
    mobileWebsiteAliases[key];

  if (alias) {
    return alias;
  }

  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);

    if (
      !["http:", "https:"]
        .includes(url.protocol)
    ) {
      throw new Error(
        "只允許開啟HTTP或HTTPS網址",
      );
    }

    return url.toString();
  }

  if (
    /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i
      .test(raw)
  ) {
    return new URL(
      "https://" + raw,
    ).toString();
  }

  return (
    "https://www.google.com/search?q=" +
    encodeURIComponent(raw)
  );
}

function openClientUrl(url: string) {
  if (typeof window === "undefined") {
    throw new Error(
      "目前不是瀏覽器環境",
    );
  }

  /*
   * 記住NUBO原本處於啟動狀態。
   * 從地圖、網站或外部App返回時，
   * 語音主控台會自動恢復。
   */
  window.localStorage.setItem(
    "nubo_voice_auto_resume_v1",
    "true",
  );

  window.localStorage.setItem(
    "nubo_external_app_return_v1",
    "true",
  );

  /*
   * 語音工具呼叫可能被瀏覽器視為
   * 非使用者點擊事件。
   * 先嘗試重用同一外部分頁；
   * 被阻擋時直接在目前頁面開啟。
   */
  try {
    const opened =
      window.open(
        url,
        "nubo_external",
      );

    if (opened) {
      try {
        opened.opener = null;
        opened.focus();
      } catch {
        // 跨網域時忽略視窗控制錯誤。
      }

      return {
        opened: true,
        url,
        mode: "new-tab",
      };
    }
  } catch {
    // 改用目前頁面。
  }

  window.location.assign(url);

  return {
    opened: true,
    url,
    mode: "same-tab",
  };
}

function buildMapsSearchUrl(
  query: string,
  location?: string,
) {
  const searchText = [
    query.trim(),
    location?.trim() ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    "https://www.google.com/maps/search/" +
    "?api=1&query=" +
    encodeURIComponent(searchText)
  );
}


const NUBO_MOBILE_APP_TOOLS_V1 = true;

function isNuboMobileBrowser() {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined"
  ) {
    return false;
  }

  const userAgent =
    navigator.userAgent || "";

  const mobileUserAgent =
    /Android|iPhone|iPad|iPod|Mobile/i
      .test(userAgent);

  const coarsePointer =
    window
      .matchMedia(
        "(pointer: coarse) and (max-width: 1100px)",
      )
      .matches;

  return (
    mobileUserAgent ||
    coarsePointer
  );
}

function normalizeMobileAppName(
  value: unknown,
) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function sanitizePhoneNumber(
  value: unknown,
) {
  const raw =
    String(value ?? "").trim();

  if (!raw) {
    return "";
  }

  if (
    !/^[+\d\s()\-]{3,30}$/.test(raw)
  ) {
    throw new Error(
      "電話號碼格式不正確",
    );
  }

  return raw.replace(
    /[\s()\-]/g,
    "",
  );
}

function resolveNuboMobileApp(
  appValue: unknown,
  queryValue?: unknown,
  valueValue?: unknown,
) {
  if (typeof window === "undefined") {
    throw new Error(
      "目前不是瀏覽器環境",
    );
  }

  const app =
    normalizeMobileAppName(
      appValue,
    );

  const query =
    String(queryValue ?? "").trim();

  const value =
    String(valueValue ?? "").trim();

  if (
    ["line", "賴"].includes(app)
  ) {
    return {
      url:
        "https://line.me/R/nv/chat",
      label: "LINE",
    };
  }

  if (
    [
      "youtube",
      "yt",
      "油管",
    ].includes(app)
  ) {
    return {
      url: query
        ? "https://www.youtube.com/results?search_query=" +
          encodeURIComponent(query)
        : "https://www.youtube.com/",
      label: "YouTube",
    };
  }

  if (
    [
      "youtubemusic",
      "ytmusic",
      "youtube音樂",
    ].includes(app)
  ) {
    return {
      url: query
        ? "https://music.youtube.com/search?q=" +
          encodeURIComponent(query)
        : "https://music.youtube.com/",
      label: "YouTube Music",
    };
  }

  if (
    [
      "facebook",
      "fb",
      "臉書",
    ].includes(app)
  ) {
    return {
      url:
        "https://www.facebook.com/",
      label: "Facebook",
    };
  }

  if (
    [
      "instagram",
      "ig",
    ].includes(app)
  ) {
    return {
      url:
        "https://www.instagram.com/",
      label: "Instagram",
    };
  }

  if (
    [
      "maps",
      "googlemaps",
      "地圖",
      "google地圖",
    ].includes(app)
  ) {
    return {
      url: query
        ? "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(query)
        : "https://www.google.com/maps/",
      label: "Google Maps",
    };
  }

  if (
    [
      "gmail",
      "googlemail",
    ].includes(app)
  ) {
    return {
      url:
        "https://mail.google.com/",
      label: "Gmail",
    };
  }

  if (
    [
      "google",
      "browser",
      "chrome",
      "瀏覽器",
    ].includes(app)
  ) {
    return {
      url: query
        ? "https://www.google.com/search?q=" +
          encodeURIComponent(query)
        : "https://www.google.com/",
      label: "Google",
    };
  }

  if (
    [
      "calculator",
      "calc",
      "計算機",
      "計算器",
    ].includes(app)
  ) {
    return {
      url:
        window.location.origin +
        "/mobile-tools/calculator",
      label: "NUBO 計算機",
    };
  }

  if (
    [
      "phone",
      "dialer",
      "電話",
      "撥號",
    ].includes(app)
  ) {
    const phoneNumber =
      sanitizePhoneNumber(value);

    return {
      url: phoneNumber
        ? "tel:" + phoneNumber
        : "tel:",
      label: "電話",
    };
  }

  if (
    [
      "sms",
      "message",
      "簡訊",
      "訊息",
    ].includes(app)
  ) {
    const phoneNumber =
      sanitizePhoneNumber(value);

    return {
      url: phoneNumber
        ? "sms:" + phoneNumber
        : "sms:",
      label: "簡訊",
    };
  }

  if (
    [
      "email",
      "mail",
      "電子郵件",
    ].includes(app)
  ) {
    if (
      value &&
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/
        .test(value)
    ) {
      throw new Error(
        "Email格式不正確",
      );
    }

    return {
      url: value
        ? "mailto:" +
          encodeURIComponent(value)
        : "mailto:",
      label: "Email",
    };
  }

  throw new Error(
    "目前手機版可開啟：LINE、YouTube、YouTube Music、Facebook、Instagram、Google Maps、Gmail、Google、NUBO計算機、電話、簡訊與Email。其他App必須另外提供官方App Link或URL Scheme。",
  );
}

export const geminiSystemInstruction = `
你是NUBO，Leo的個人AI語音總管。一律使用自然、簡潔的繁體中文。

工作原則：
1. NUBO_FAST_ROUTER_V1：一般聊天、常識、簡單建議與一般問題直接回答；不得因為只是問問題就呼叫research_now，也不得說「請稍等」。
1A. 使用者詢問天氣、溫度、降雨、颱風或明後天天氣時，立即呼叫get_weather，不得呼叫research_now。
1A-1. 必須保留使用者說出的完整地點，包括國家、城市、行政區、鄉鎮、道路、地標或地址。例如「台中西屯區天氣」要傳入「台中市西屯區」，不得只傳台中。
1A-2. 使用者已指定地點時，不得改用台南；只有完全沒有說地點時才使用台南。
1A-3. 若工具回傳approximate=true，仍要回答天氣，但需簡短說明這是以鄰近城市中心估算。
1B. 使用者要求規劃旅行、機票或日本行程，但缺少出發地、目的地、出發與回程日期、人數或預算時，先用一句話一次問齊，不得立即呼叫research_now或travel_plan。
1C. 旅遊條件齊全後才呼叫travel_plan。
1D. 只有使用者明確要求深入研究、最新比較、查證、多來源分析，或問題確實需要即時外部資料時，才呼叫research_now。
1E. NUBO_MOBILE_PLACES_V1：使用者詢問附近、周邊、這附近、住家附近的飲料店、因料店、餐廳、咖啡廳、早餐店、便利商店、藥局、停車場、加油站或其他店家時，立即呼叫search_nearby，不得呼叫research_now。
1E-1. 只傳入店家類型或搜尋條件，例如「飲料店」「評價好的餐廳」「營業中的咖啡廳」。使用者有指定城市或行政區時才填location。
1E-2. 使用者只說附近、周邊、這裡或我住的周邊時，不得自行改成台南；location保持空白，讓Google Maps使用手機目前位置。
1E-3. search_nearby會直接開啟Google Maps；工具完成後只需簡短說已開啟，不要再重複深度搜尋。
3A. 手機版要求開啟Facebook、FB、臉書、Instagram、IG、Google、Gmail、地圖或網址時，必須呼叫open_website；手機端會直接開啟官方網頁或對應App，不得回答無法開啟。
2. 使用者想聽音樂或看影片時，呼叫open_youtube並直接播放，不要只開搜尋頁。
2A. 手機版要求播放歌曲、音樂或YouTube影片時仍呼叫open_youtube；工具會直接開啟YouTube或YouTube Music App／網頁。不得改用research_now。
2B. 手機瀏覽器可能限制第一次有聲自動播放；遇到限制時仍需提供可直接點擊的播放連結，不得說已播放成功。
3. 使用者要開啟Facebook、Instagram、Google、Gmail、網站或網址時，呼叫open_website。
3A. 手機版要求開啟LINE、YouTube、YouTube Music、Facebook、Instagram、Google Maps、Gmail、Google、計算機、電話、簡訊或Email時，呼叫open_mobile_app。
3B. 開啟手機計算機時，open_mobile_app的app使用calculator。
3C. 開啟LINE App時，open_mobile_app的app使用line。
3D. 使用者要求撥號、簡訊或Email時，只能開啟對應介面，不得宣稱已完成通話、寄信或傳送簡訊。
3E. 不得聲稱可以任意啟動所有已安裝App；只有已支援官方App Link、Universal Link或安全白名單的App才能開啟。
4. 使用者呼叫「nubo」、要求NUBO出來、跳出來或回到桌面時，呼叫show_nubo。
5. 使用者要關閉Facebook、Instagram、Gmail、YouTube、Chrome、Edge或瀏覽器視窗時，呼叫close_webpage。
6. 使用者要開啟計算機、記事本、小畫家、檔案總管、設定或時鐘時，呼叫open_desktop_app。
7. 使用者要關閉LINE、計算機、記事本、小畫家、Chrome、Edge或Firefox等白名單程式時，呼叫close_desktop_app。
8. 使用者問郵件時，先用gmail_search，再視需要用gmail_read；摘要時不得捏造內容。
9. 使用者說寄到「我的Google信箱」、「我的Gmail」或「寄給我自己」時，先呼叫gmail_status取得email，再使用該email；若工具允許，也可用to=me。
10. 使用者說「寄信」「寄出」「寄給某人」代表要正式寄送，必須呼叫gmail_prepare_send，不得只建立草稿。只有使用者明確說「建立草稿」「先存草稿」時，才呼叫gmail_create_draft。gmail_prepare_send完成後，覆誦收件者、主旨與內容摘要並等待確認。
10A. 使用者下一句說「確認寄出」「確定寄出」「寄出吧」「可以寄」時，立即呼叫gmail_confirm_send。即使沒有pendingId也必須呼叫，系統會自動確認最近一封待確認郵件；不得再次建立草稿或重複準備同一封郵件。
11. 使用者要求每天或每小時自動整理Gmail時，建立sourceType=gmail的brief任務。
12. 使用者要求排程結果寄信時設定deliveryType。gmail_send只有環境白名單允許才會自動寄出，否則建立草稿。
13. 預設時區固定Asia/Taipei，具體時間使用含+08:00的ISO 8601。
13A. NUBO_TIME_SOURCE_V1：使用者詢問現在幾點、目前時間、今天日期、今天幾號、星期幾，必須先呼叫get_current_time，禁止依模型記憶或猜測回答。
13B. 使用者提到今天、明天、後天、今晚、幾分鐘後、幾小時後、下星期或任何相對日期與排程時，也要先呼叫get_current_time，再計算實際日期時間。
13C. 未指定地區時使用Asia/Taipei；指定其他國家或城市時，傳入正確IANA時區，例如東京Asia/Tokyo、紐約America/New_York、倫敦Europe/London。
14. 使用者說現在就做時，建立任務後再呼叫task_action的run。

安全規則：
- 研究、讀信、摘要、建立草稿、播放YouTube、開啟網頁、喚出NUBO、關閉瀏覽器視窗與白名單Windows工具可直接執行。
- open_website只允許HTTP與HTTPS；open_desktop_app與close_desktop_app只允許預先列出的Windows工具。
- close_webpage只能關閉可見瀏覽器視窗；close_desktop_app只送出正常視窗關閉請求，不得刪檔、不得關機、不得執行任意命令。
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
    name: "get_current_time",
    description:
      "取得精確的目前日期、時間與星期。詢問現在幾點、今天日期、星期幾或處理相對日期與排程時必須使用；未指定地區時使用Asia/Taipei。",
    parameters: {
      type: "OBJECT",
      properties: {
        timezone: {
          type: "STRING",
          nullable: true,
          description:
            "IANA時區，例如Asia/Taipei、Asia/Tokyo、America/New_York或Europe/London。",
        },
        location: {
          type: "STRING",
          nullable: true,
          description:
            "使用者詢問的城市或地區名稱。",
        },
      },
    },
  },
  {
    name: "search_nearby",
    description:
      "極速搜尋手機目前位置附近的餐廳、飲料店、咖啡廳、商店、藥局、停車場或其他地點，並直接開啟Google Maps。附近搜尋不得改用research_now。",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description:
            "要搜尋的店家類型或條件，例如飲料店、評價好的餐廳、營業中的咖啡廳。",
        },
        location: {
          type: "STRING",
          nullable: true,
          description:
            "使用者明確指定的城市、行政區或地點；詢問目前附近時留空。",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_weather",
    description:
      "智慧查詢世界各地城市、行政區、鄉鎮、道路、地標或地址的目前、今天與明天天氣；必須傳入完整地點，未指定時才使用台南。",
    parameters: {
      type: "OBJECT",
      properties: {
        location: {
          type: "STRING",
          nullable: true,
        },
      },
    },
  },
  {
    name: "travel_plan",
    description:
      "在出發地、目的地、去回日期、人數與預算都已確認後，產生高CP值機票與完整行程。",
    parameters: {
      type: "OBJECT",
      properties: {
        origin: { type: "STRING" },
        destination: { type: "STRING" },
        departureDate: { type: "STRING" },
        returnDate: { type: "STRING" },
        travelers: { type: "NUMBER" },
        budget: { type: "STRING" },
        preferences: {
          type: "STRING",
          nullable: true,
        },
      },
      required: [
        "origin",
        "destination",
        "departureDate",
        "returnDate",
        "travelers",
        "budget",
      ],
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
    name: "open_mobile_app",
    description:
      "開啟手機安全白名單App或工具：LINE、YouTube、YouTube Music、Facebook、Instagram、Google Maps、Gmail、Google、NUBO計算機、電話、簡訊或Email。",
    parameters: {
      type: "OBJECT",
      properties: {
        app: {
          type: "STRING",
          description:
            "要開啟的App或工具名稱。",
        },
        query: {
          type: "STRING",
          nullable: true,
          description:
            "YouTube歌曲、Google搜尋或地圖搜尋內容。",
        },
        value: {
          type: "STRING",
          nullable: true,
          description:
            "電話號碼、簡訊號碼或Email地址。",
        },
      },
      required: ["app"],
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
    description: "開啟Facebook、Instagram、Google、Gmail、NUBO、任意HTTP/HTTPS網址或搜尋關鍵字。",
    parameters: {
      type: "OBJECT",
      properties: { target: { type: "STRING" } },
      required: ["target"],
    },
  },
  {
    name: "show_nubo",
    description: "把NUBO網頁喚出到桌面；若找不到已開啟的NUBO視窗則重新開啟。",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "close_webpage",
    description: "關閉可見瀏覽器視窗，例如Facebook、Instagram、Gmail、YouTube、Chrome、Edge或瀏覽器。",
    parameters: {
      type: "OBJECT",
      properties: { target: { type: "STRING" } },
      required: ["target"],
    },
  },
  {
    name: "open_desktop_app",
    description: "開啟安全白名單內的Windows工具，例如LINE、計算機、記事本、小畫家、檔案總管、設定或時鐘。",
    parameters: {
      type: "OBJECT",
      properties: { app: { type: "STRING" } },
      required: ["app"],
    },
  },
  {
    name: "close_desktop_app",
    description: "以正常視窗關閉方式關閉安全白名單內的Windows程式，例如LINE、計算機、記事本、小畫家、Chrome、Edge或Firefox。",
    parameters: {
      type: "OBJECT",
      properties: { app: { type: "STRING" } },
      required: ["app"],
    },
  },
  {
    name: "gmail_status",
    description: "檢查Gmail是否已完成OAuth連接，並回傳已授權Google信箱。",
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
    description: "建立Gmail草稿，不會直接寄出；to可用email或me代表已授權Google信箱。",
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
    description: "準備寄送並回傳預覽與pendingId，之後必須等使用者確認；to可用email或me代表已授權Google信箱。",
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
    description:
      "使用者明確說確認寄出、確定寄出、寄出吧或可以寄時，正式寄出最近一封待確認郵件；pendingId可省略。",
    parameters: {
      type: "OBJECT",
      properties: {
        pendingId: {
          type: "STRING",
          nullable: true,
        },
      },
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
  if (name === "get_current_time") {
    const requestedTimezone =
      String(
        args.timezone ??
        "Asia/Taipei",
      ).trim() || "Asia/Taipei";

    const location =
      String(args.location ?? "").trim();

    const now = new Date();

    const formatterOptions:
      Intl.DateTimeFormatOptions = {
        timeZone: requestedTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      };

    let timezone =
      requestedTimezone;

    let formatter:
      Intl.DateTimeFormat;

    let fallbackApplied = false;

    try {
      formatter =
        new Intl.DateTimeFormat(
          "zh-TW",
          formatterOptions,
        );
    } catch {
      timezone = "Asia/Taipei";
      fallbackApplied = true;

      formatter =
        new Intl.DateTimeFormat(
          "zh-TW",
          {
            ...formatterOptions,
            timeZone: timezone,
          },
        );
    }

    const formattedParts =
      formatter.formatToParts(now);

    const readPart = (type: string) =>
      formattedParts.find(
        (part) => part.type === type,
      )?.value ?? "";

    return {
      ok: true,
      source:
        "browser-device-clock",
      location:
        location || undefined,
      requestedTimezone,
      timezone,
      fallbackApplied,
      isoUtc: now.toISOString(),
      unixMs: now.getTime(),
      localTime:
        formatter.format(now),
      year: readPart("year"),
      month: readPart("month"),
      day: readPart("day"),
      weekday:
        readPart("weekday"),
      hour: readPart("hour"),
      minute:
        readPart("minute"),
      second:
        readPart("second"),
    };
  }

  if (name === "search_nearby") {
    const query =
      String(args.query ?? "").trim();

    const location =
      String(
        args.location ?? "",
      ).trim();

    if (!query) {
      throw new Error(
        "缺少附近搜尋項目",
      );
    }

    const url =
      buildMapsSearchUrl(
        query,
        location || undefined,
      );

    if (isMobileWebClient()) {
      return {
        ...openClientUrl(url),
        provider: "Google Maps",
        query,
        location:
          location || "目前位置",
      };
    }

    return post(
      "/api/system/open-website",
      { target: url },
    );
  }

  if (name === "get_weather") {
    return post("/api/weather", {
      location: args.location || undefined,
    });
  }

  if (name === "travel_plan") {
    return post("/api/travel/plan", {
      origin: args.origin,
      destination: args.destination,
      departureDate: args.departureDate,
      returnDate: args.returnDate,
      travelers: args.travelers,
      budget: args.budget,
      preferences: args.preferences || undefined,
    });
  }
  if (name === "research_now") return post("/api/research/run", { question: args.question, title: args.title || undefined });
  if (name === "open_mobile_app") {
    const destination =
      resolveNuboMobileApp(
        args.app,
        args.query,
        args.value,
      );

    return {
      ok: true,
      mobileUrl:
        destination.url,
      mobileLabel:
        destination.label,
      autoOpen: true,
      supported: true,
    };
  }

  if (name === "open_youtube") {
    const service =
      args.service === "youtube"
        ? "youtube"
        : "youtube_music";

    const result =
      await post(
        "/api/youtube/open",
        {
          query: args.query,
          service,
        },
      );

    if (
      isNuboMobileBrowser() &&
      result &&
      typeof result === "object" &&
      "videoId" in result &&
      typeof result.videoId === "string"
    ) {
      const videoId =
        encodeURIComponent(
          result.videoId,
        );

      const mobileUrl =
        service === "youtube_music"
          ? "https://music.youtube.com/watch?v=" +
            videoId
          : "https://www.youtube.com/watch?v=" +
            videoId +
            "&autoplay=1";

      return {
        ...result,
        mobileUrl,
        mobileLabel:
          service === "youtube_music"
            ? "YouTube Music"
            : "YouTube",
        autoOpen: true,
      };
    }

    return result;
  }
  if (name === "open_website") {
    const target =
      String(
        normalizeTarget(args.target),
      ).trim();

    if (isMobileWebClient()) {
      const url =
        resolveClientWebsite(target);

      return {
        ...openClientUrl(url),
        target,
        mobile: true,
      };
    }

    return post(
      "/api/system/open-website",
      { target },
    );
  }
  if (name === "show_nubo") return post("/api/system/show-nubo", {});
  if (name === "close_webpage") return post("/api/system/browser-window", { action: "close", target: normalizeTarget(args.target || "browser") });
  if (name === "open_desktop_app") return post("/api/system/open-app", { app: args.app });
  if (name === "close_desktop_app") return post("/api/system/open-app", { action: "close", app: args.app });
  if (name === "gmail_search") return post("/api/gmail/search", { query: args.query, maxResults: args.maxResults || 10 });
  if (name === "gmail_read") return post("/api/gmail/read", { id: args.id });
  if (name === "gmail_create_draft") return post("/api/gmail/draft", { to: args.to, subject: args.subject, body: args.body });
  if (
    name === "gmail_prepare_send"
  ) {
    const result = await post(
      "/api/gmail/prepare-send",
      {
        to: args.to,
        subject: args.subject,
        body: args.body,
      },
    );

    const pendingId =
      typeof result?.pendingId ===
      "string"
        ? result.pendingId.trim()
        : "";

    if (pendingId) {
      savePendingGmailId(
        pendingId,
      );
    }

    return result;
  }

  if (
    name === "gmail_confirm_send"
  ) {
    const suppliedPendingId =
      String(
        args.pendingId ?? "",
      ).trim();

    const pendingId =
      suppliedPendingId ||
      readPendingGmailId();

    const result = await post(
      "/api/gmail/confirm-send",
      pendingId
        ? { pendingId }
        : {},
    );

    clearPendingGmailId();

    return result;
  }

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
