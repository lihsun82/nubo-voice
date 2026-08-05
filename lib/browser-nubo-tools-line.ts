"use client";

import {
  executeNuboBrowserTool as executeBaseTool,
  geminiFunctionDeclarations as baseDeclarations,
  geminiSystemInstruction as baseInstruction,
  type FunctionCall,
} from "@/lib/browser-nubo-tools";

export type { FunctionCall };

const NUBO_MOBILE_OPEN_FALLBACK_ID = "nubo-mobile-open-fallback";
const NUBO_YOUTUBE_WINDOW_NAME = "nubo_youtube_player";

function getMobileOpenLabel(targetUrl: string, callName: string) {
  const normalizedUrl = targetUrl.toLowerCase();

  if (normalizedUrl.includes("facebook.com") || normalizedUrl.includes("fb.com")) return "Facebook";
  if (normalizedUrl.includes("instagram.com")) return "Instagram";
  if (normalizedUrl.includes("youtube.com") || normalizedUrl.includes("youtu.be")) return "YouTube";
  if (normalizedUrl.includes("maps.google.") || normalizedUrl.includes("google.com/maps")) return "Google Maps";
  if (normalizedUrl.includes("mail.google.com")) return "Gmail";
  if (callName === "open_website") return "網站";
  return "手機工具";
}

function ensureYouTubeUrl(result: unknown) {
  if (!result || typeof result !== "object") return result;

  const payload = result as Record<string, unknown>;
  const videoId = String(payload.videoId ?? "").trim();
  const existingUrl = String(payload.mobileUrl ?? payload.url ?? payload.playerUrl ?? "").trim();

  if (!videoId && !existingUrl) return result;

  const targetUrl = videoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&autoplay=1`
    : existingUrl;

  return {
    ...payload,
    ok: payload.ok !== false,
    mobileUrl: targetUrl,
    url: targetUrl,
    playerUrl: targetUrl,
    mobileLabel: "YouTube",
    autoOpen: true,
    supported: true,
    preserveNubo: true,
    inlinePlayback: false,
    build: "deployed-youtube-external-v3-20260806",
  };
}

function showHardMobileOpenFallback(targetUrl: string, label: string) {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  document.getElementById(NUBO_MOBILE_OPEN_FALLBACK_ID)?.remove();

  const wrapper = document.createElement("div");
  wrapper.id = NUBO_MOBILE_OPEN_FALLBACK_ID;
  wrapper.setAttribute("role", "dialog");
  wrapper.setAttribute("aria-live", "assertive");
  wrapper.style.position = "fixed";
  wrapper.style.left = "10px";
  wrapper.style.right = "10px";
  wrapper.style.bottom = "calc(env(safe-area-inset-bottom, 0px) + 12px)";
  wrapper.style.zIndex = "2147483647";
  wrapper.style.display = "grid";
  wrapper.style.gap = "10px";
  wrapper.style.padding = "14px";
  wrapper.style.border = "1px solid rgba(255,255,255,.22)";
  wrapper.style.borderRadius = "18px";
  wrapper.style.background = "rgba(7,9,13,.96)";
  wrapper.style.boxShadow = "0 18px 60px rgba(0,0,0,.5)";
  wrapper.style.backdropFilter = "blur(18px)";

  const title = document.createElement("div");
  title.textContent = `手機瀏覽器已擋住自動開啟，請點下方按鈕開啟 ${label}`;
  title.style.color = "#f6f7fb";
  title.style.fontSize = "14px";
  title.style.lineHeight = "1.45";
  title.style.textAlign = "center";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `點我開啟 ${label}`;
  button.style.width = "100%";
  button.style.minHeight = "54px";
  button.style.border = "0";
  button.style.borderRadius = "999px";
  button.style.color = "#111";
  button.style.background = "linear-gradient(135deg, #f5c26b, #ff8a3d)";
  button.style.font = "inherit";
  button.style.fontWeight = "800";
  button.style.cursor = "pointer";
  button.onclick = () => {
    window.localStorage.setItem("nubo_voice_auto_resume_v1", "true");
    const opened = window.open(targetUrl, NUBO_YOUTUBE_WINDOW_NAME);
    if (!opened) window.location.href = targetUrl;
    wrapper.remove();
  };

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "先不要開啟";
  close.style.width = "100%";
  close.style.minHeight = "40px";
  close.style.border = "1px solid rgba(255,255,255,.18)";
  close.style.borderRadius = "999px";
  close.style.color = "#f6f7fb";
  close.style.background = "transparent";
  close.style.font = "inherit";
  close.onclick = () => wrapper.remove();

  wrapper.append(title, button, close);
  document.body.appendChild(wrapper);
}

function preopenYouTubeWindow() {
  if (typeof window === "undefined") return null;

  try {
    const opened = window.open("about:blank", NUBO_YOUTUBE_WINDOW_NAME);
    if (opened) {
      opened.document.title = "正在開啟 YouTube…";
      return opened;
    }
  } catch {
    // 瀏覽器阻擋時，完成搜尋後顯示手動備援按鈕。
  }

  return null;
}

function forceMobileOpen(
  result: unknown,
  callName: string,
  reservedWindow: Window | null = null,
) {
  if (typeof window === "undefined") return result;
  if (!result || typeof result !== "object") {
    reservedWindow?.close();
    return result;
  }

  const payload = result as {
    mobileUrl?: unknown;
    mobileLabel?: unknown;
    url?: unknown;
    playerUrl?: unknown;
  };

  const targetUrl =
    typeof payload.mobileUrl === "string" && payload.mobileUrl
      ? payload.mobileUrl
      : typeof payload.url === "string" && payload.url
        ? payload.url
        : typeof payload.playerUrl === "string"
          ? payload.playerUrl
          : "";

  if (!targetUrl) {
    reservedWindow?.close();
    return result;
  }

  const label =
    typeof payload.mobileLabel === "string"
      ? payload.mobileLabel
      : getMobileOpenLabel(targetUrl, callName);

  window.localStorage.setItem("nubo_voice_auto_resume_v1", "true");

  let opened = false;

  if (reservedWindow && !reservedWindow.closed) {
    try {
      reservedWindow.location.replace(targetUrl);
      reservedWindow.focus();
      opened = true;
    } catch {
      reservedWindow.close();
    }
  }

  if (!opened) {
    try {
      const external = window.open(targetUrl, NUBO_YOUTUBE_WINDOW_NAME);
      if (external) {
        external.focus();
        opened = true;
      }
    } catch {
      // 交由下方備援處理。
    }
  }

  if (!opened) showHardMobileOpenFallback(targetUrl, label);

  return {
    ...(result as Record<string, unknown>),
    autoOpen: false,
    opened,
    mode: opened ? "external-tab" : "blocked-fallback",
    forcedSameTab: false,
    externalTab: true,
    preserveNubo: true,
    mobileUrl: targetUrl,
    mobileLabel: label,
    build: "deployed-youtube-external-v3-20260806",
  };
}

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
  if (call.name === "open_youtube") {
    const reservedWindow = preopenYouTubeWindow();
    try {
      const result = ensureYouTubeUrl(await executeBaseTool(call));
      return forceMobileOpen(result, call.name, reservedWindow);
    } catch (error) {
      reservedWindow?.close();
      throw error;
    }
  }
  if (call.name === "open_mobile_app" || call.name === "open_website") {
    return forceMobileOpen(await executeBaseTool(call), call.name);
  }
  return executeBaseTool(call);
}

export const geminiSystemInstruction = `${baseInstruction}
手機開啟補充：使用者要求開啟Facebook、FB、臉書、Instagram、IG、YouTube、Google、Gmail、地圖或任何HTTP/HTTPS網站時，必須呼叫open_mobile_app或open_website，不得回答只能在Windows使用。
YouTube播放補充：使用者指定歌曲、歌手、MV、音樂或影片時，必須呼叫open_youtube，並在新的YouTube分頁播放，不得只口頭回答，也不得在NUBO頁面內嵌播放。
手機開啟補充：若瀏覽器阻擋新分頁，必須顯示強制備援按鈕，不得宣稱已開啟。
桌面應用程式補充：只有使用者明確要求Windows桌面程式時，才呼叫open_desktop_app。
桌面應用程式補充：使用者要求開啟LINE或賴時，呼叫open_desktop_app，app參數使用line。
桌面關閉補充：使用者要求關閉LINE、賴、計算機、記事本、小畫家、Chrome、Edge或Firefox時，呼叫close_desktop_app。
NUBO喚醒補充：使用者呼叫nubo、叫nubo出來或要求NUBO網頁跳出來時，呼叫show_nubo。
裝置設定補充：使用者要求設定音量、靜音、解除靜音、增加或降低音量、設定螢幕亮度、增加或降低亮度時，呼叫device_setting。
智慧燈補充：使用者要求開燈、關燈、切換燈、打開燈、把燈關掉、房間燈或大廳燈時，呼叫smart_light；action使用on、off或toggle。
LINE、Windows應用程式與智慧燈只能使用已定義的安全工具；不得執行任意程式路徑或命令。
`;

export const geminiFunctionDeclarations = [
  ...baseDeclarations.map((declaration) => {
    if (declaration.name === "open_mobile_app") {
      return {
        ...declaration,
        description:
          "手機/平板優先工具：開啟LINE、Facebook、Instagram、Google Maps、Gmail、Google、NUBO計算機、電話、簡訊或Email。指定歌曲、歌手、MV或影片時禁止使用本工具，必須使用open_youtube。",
      };
    }
    if (declaration.name === "open_youtube") {
      return {
        ...declaration,
        description:
          "指定歌曲、歌手、MV、音樂或影片的唯一播放工具。搜尋取得videoId後，在新的YouTube分頁開啟精確影片網址並嘗試自動播放；不得在NUBO內嵌播放。",
      };
    }
    if (declaration.name === "open_website") {
      return {
        ...declaration,
        description:
          "在目前使用者裝置開啟HTTP/HTTPS網站、Facebook、Instagram、Google、Gmail、NUBO、網址或搜尋關鍵字。",
      };
    }
    if (declaration.name === "open_desktop_app") {
      return {
        ...declaration,
        description:
          "只用於明確要求Windows桌面工具：LINE、計算機、記事本、小畫家、檔案總管、Windows設定或時鐘。不得用於Facebook、Instagram、YouTube、Google、Gmail或任何手機網站。",
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
