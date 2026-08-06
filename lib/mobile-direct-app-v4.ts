"use client";

import type { FunctionCall } from "@/lib/browser-nubo-tools";

const YOUTUBE_WINDOW_NAME = "nubo_youtube_player";

function getMobileOpenLabel(targetUrl: string, callName: string) {
  const normalized = targetUrl.toLowerCase();
  if (normalized.includes("line.me") || normalized.startsWith("line:")) return "LINE";
  if (normalized.includes("facebook.com") || normalized.includes("fb.com")) return "Facebook";
  if (normalized.includes("instagram.com")) return "Instagram";
  if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) return "YouTube";
  if (normalized.includes("maps.google.") || normalized.includes("google.com/maps")) return "Google Maps";
  if (normalized.includes("mail.google.com")) return "Gmail";
  if (normalized.includes("google.com")) return "Google";
  return callName === "open_website" ? "網站" : "手機工具";
}

export function resolveWebsiteMobileResult(call: FunctionCall) {
  const raw = String(call.args?.target ?? "").trim();
  const key = raw.toLowerCase().replace(/[\s　]+/g, "");
  const aliases: Record<string, string> = {
    fb: "https://www.facebook.com/",
    facebook: "https://www.facebook.com/",
    臉書: "https://www.facebook.com/",
    ig: "https://www.instagram.com/",
    instagram: "https://www.instagram.com/",
    line: "https://line.me/R/nv/chat",
    賴: "https://line.me/R/nv/chat",
    youtube: "https://www.youtube.com/",
    yt: "https://www.youtube.com/",
    google: "https://www.google.com/",
    gmail: "https://mail.google.com/",
    maps: "https://www.google.com/maps/",
    googlemaps: "https://www.google.com/maps/",
    地圖: "https://www.google.com/maps/",
    nubo: window.location.origin,
    nubovoice: window.location.origin,
    努寶: window.location.origin,
  };

  let targetUrl = aliases[key] ?? "";
  if (!targetUrl && /^https?:\/\//i.test(raw)) targetUrl = new URL(raw).toString();
  if (!targetUrl && /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) {
    targetUrl = new URL(`https://${raw}`).toString();
  }
  if (!targetUrl) {
    targetUrl = "https://www.google.com/search?q=" + encodeURIComponent(raw);
  }

  return {
    ok: true,
    mobileUrl: targetUrl,
    mobileLabel: getMobileOpenLabel(targetUrl, "open_website"),
    autoOpen: true,
    supported: true,
  };
}

function isYouTubeUrl(url: string) {
  const normalized = url.toLowerCase();
  return normalized.includes("youtube.com") || normalized.includes("youtu.be");
}

function openExternal(url: string, label: string) {
  let opened = false;

  try {
    const targetName = isYouTubeUrl(url) ? YOUTUBE_WINDOW_NAME : "nubo_mobile_external";
    const external = window.open(url, targetName);
    if (external) {
      external.focus();
      opened = true;
    }
  } catch {
    opened = false;
  }

  if (!opened) {
    // 語音工具回呼通常不被手機瀏覽器視為直接點擊；新分頁遭封鎖時，
    // 立即同頁跳轉，確保使用者至少能進入 YouTube，不再完全無反應。
    window.location.assign(url);
    opened = true;
  }

  return {
    opened,
    mode: opened ? "external-or-same-tab" : "blocked",
    label,
  };
}

export function forceDirectMobileOpen(result: unknown, callName: string) {
  if (typeof window === "undefined" || !result || typeof result !== "object") {
    return result;
  }

  const payload = result as {
    mobileUrl?: unknown;
    url?: unknown;
    playerUrl?: unknown;
    mobileLabel?: unknown;
  };

  const targetUrl =
    typeof payload.mobileUrl === "string" && payload.mobileUrl
      ? payload.mobileUrl
      : typeof payload.url === "string" && payload.url
        ? payload.url
        : typeof payload.playerUrl === "string"
          ? payload.playerUrl
          : "";

  if (!targetUrl) return result;

  const label =
    typeof payload.mobileLabel === "string" && payload.mobileLabel
      ? payload.mobileLabel
      : getMobileOpenLabel(targetUrl, callName);

  window.localStorage.setItem("nubo_voice_auto_resume_v1", "true");
  const launch = openExternal(targetUrl, label);

  return {
    ...(result as Record<string, unknown>),
    autoOpen: false,
    opened: launch.opened,
    mode: launch.mode,
    externalTab: true,
    forcedSameTab: false,
    preserveNubo: launch.mode !== "external-or-same-tab" ? true : undefined,
    launchedUrl: targetUrl,
    fallbackUrl: targetUrl,
    mobileLabel: label,
    build: "youtube-guaranteed-open-v15-6-25-20260806",
  };
}
