"use client";

import {
  executeNuboBrowserTool as executeBaseTool,
  geminiFunctionDeclarations as baseDeclarations,
  geminiSystemInstruction as baseInstruction,
  type FunctionCall,
} from "@/lib/browser-nubo-tools";

export type { FunctionCall };

const NUBO_MOBILE_OPEN_FALLBACK_ID = "nubo-mobile-open-fallback";

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
  button.onclick = () => {
    window.localStorage.setItem("nubo_voice_auto_resume_v1", "true");
    window.localStorage.setItem("nubo_external_app_return_v1", "true");
    window.location.href = targetUrl;
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

function forceMobileOpen(result: unknown, callName: string) {
  if (typeof window === "undefined") return result;
  if (!result || typeof result !== "object") return result;

  const payload = result as { mobileUrl?: unknown; mobileLabel?: unknown; url?: unknown };
  const targetUrl =
    typeof payload.mobileUrl === "string"
      ? payload.mobileUrl
      : typeof payload.url === "string"
        ? payload.url
        : "";
  if (!targetUrl) return result;

  const label =
    typeof payload.mobileLabel === "string"
      ? payload.mobileLabel
      : getMobileOpenLabel(targetUrl, callName);

  window.localStorage.setItem("nubo_voice_auto_resume_v1", "true");
  window.localStorage.setItem("nubo_external_app_return_v1", "true");
  showHardMobileOpenFallback(targetUrl, label);

  try {
    window.location.href = targetUrl;
  } catch {
    window.location.assign(targetUrl);
  }

  return {
    ...(result as Record<string, unknown>),
    autoOpen: false,
    opened: true,
    mode: "same-tab",
    forcedSameTab: true,
    mobileUrl: targetUrl,
    mobileLabel: label,
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
  if (
    call.name === "open_mobile_app" ||
    call.name === "open_youtube" ||
    call.name === "open_website"
  ) {
    return forceMobileOpen(await executeBaseTool(call), call.name);
  }
  return executeBaseTool(call);
}

export const geminiSystemInstruction = `${baseInstruction}
手機開啟補充：使用者要求開啟Facebook、FB、臉書、Instagram、IG、YouTube、Google、Gmail、地圖或任何HTTP/HTTPS網站時，必須呼叫open_mobile_app或open_website，不得回答只能在Windows使用。
手機開啟補充：手機瀏覽器會用目前分頁或畫面底部的強制備援按鈕開啟，不得宣稱已開啟但實際只開Windows。
桌面應用程式補充：只有使用者明確要求Windows桌面程式時，才呼叫open_desktop_app。
桌面應用程式補充：使用者要求開啟LINE或賴時，呼叫open_desktop_app，app參數使用line。
桌面關閉補充：使用者要求關閉LINE、賴、計算機、記事本、小畫家、Chrome、Edge或Firefox時，呼叫close_desktop_app。
NUBO喚醒補充：使用者呼叫nubo、叫nubo出來或要求NUBO網頁跳出來時，呼叫show_nubo。
裝置設定補充：使用者要求設定音量、靜音、解除靜音、增加或降低音量、設定螢幕亮度、增加或降低亮度時，呼叫device_setting。
LINE與Windows應用程式只能使用固定白名單；不得執行任意程式路徑或命令。
等待提示禁用：你正在思考、查找資料、執行工具或跑流程時，不得用語音說「請稍等」「等一下」「我正在處理」「我正在查找」等等待提示。只需要在完成後直接回答。
`;

export const geminiFunctionDeclarations = [
  ...baseDeclarations.map((declaration) => {
    if (declaration.name === "open_mobile_app") {
      return {
        ...declaration,
        description:
          "手機/平板優先工具：開啟LINE、YouTube、YouTube Music、Facebook、Instagram、Google Maps、Gmail、Google、NUBO計算機、電話、簡訊或Email。不得改用Windows工具。",
      };
    }
    if (declaration.name === "open_website") {
      return {
        ...declaration,
        description:
          "在目前使用者裝置開啟HTTP/HTTPS網站、Facebook、Instagram、Google、Gmail、NUBO、網址或搜尋關鍵字。手機會在手機瀏覽器或強制備援按鈕開啟。",
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
];
