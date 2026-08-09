"use client";

import type { FunctionCall } from "@/lib/browser-nubo-tools";

function getMobileOpenLabel(targetUrl: string, callName: string) {
  const normalized = targetUrl.toLowerCase();
  if (normalized.includes("line.me") || normalized.startsWith("line:")) return "LINE";
  if (normalized.includes("facebook.com") || normalized.includes("fb.com")) return "Facebook";
  if (normalized.includes("instagram.com")) return "Instagram";
  if (normalized.includes("music.youtube.com")) return "YouTube Music";
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

function isAndroid() {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");
}

function extractYouTubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    }
    if (parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v") ?? "";
    }
  } catch {
    return "";
  }
  return "";
}

function buildYouTubeAppLink(url: string, preferMusic: boolean) {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return url;

  if (preferMusic) {
    const music = new URL("https://music.youtube.com/watch");
    music.searchParams.set("v", videoId);
    music.searchParams.set("autoplay", "1");
    return music.toString();
  }

  return `https://youtu.be/${encodeURIComponent(videoId)}`;
}

function openInSeparateContext(url: string, targetName: string) {
  try {
    const external = window.open(url, targetName);
    if (external) {
      try {
        external.opener = null;
        external.focus();
      } catch {
        // Cross-origin window control can fail without affecting the launch.
      }
      return true;
    }
  } catch {
    // Caller will preserve NUBO and report blocked instead of replacing it.
  }
  return false;
}

function openExternal(
  url: string,
  label: string,
  options?: { preferYouTubeMusic?: boolean },
) {
  const youtube = isYouTubeUrl(url);
  const preferMusic = options?.preferYouTubeMusic === true;

  if (youtube && isAndroid()) {
    const appLink = buildYouTubeAppLink(url, preferMusic);
    const opened = openInSeparateContext(
      appLink,
      preferMusic ? "nubo_youtube_music_app" : "nubo_youtube_app",
    );

    return {
      opened,
      mode: opened
        ? preferMusic
          ? "youtube-music-app-link"
          : "youtube-app-link"
        : "youtube-app-link-blocked",
      launchedUrl: appLink,
      fallbackUrl: url,
      label,
    };
  }

  const opened = openInSeparateContext(
    url,
    youtube ? "nubo_youtube_external" : "nubo_mobile_external",
  );

  if (!opened && youtube) {
    return {
      opened: false,
      mode: "youtube-launch-blocked",
      launchedUrl: "",
      fallbackUrl: url,
      label,
    };
  }

  if (!opened) {
    window.location.assign(url);
    return {
      opened: true,
      mode: "same-tab",
      launchedUrl: url,
      fallbackUrl: url,
      label,
    };
  }

  return {
    opened: true,
    mode: "external-tab",
    launchedUrl: url,
    fallbackUrl: url,
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
    preferredYouTubeApp?: unknown;
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
  window.localStorage.setItem("nubo_external_app_return_v1", "true");

  const youtube = isYouTubeUrl(targetUrl);
  const preferMusic = payload.preferredYouTubeApp === "music";

  /*
   * V15.6.38: YouTube must have exactly one launch owner.
   * Do NOT open YouTube here. Return the final Android app-link target and let
   * the visible NUBO "開啟：YouTube" DOM action appear first; NuboDirectOpenGuard
   * will auto-click that action once. This removes the race where the early
   * direct launch opened a web page before the button auto-click path existed.
   */
  if (youtube) {
    const launchUrl = isAndroid()
      ? buildYouTubeAppLink(targetUrl, preferMusic)
      : targetUrl;

    return {
      ...(result as Record<string, unknown>),
      mobileUrl: launchUrl,
      url: launchUrl,
      playerUrl: launchUrl,
      autoOpen: false,
      opened: false,
      mode: "youtube-await-auto-click",
      externalTab: false,
      youtubeAppPreferred: isAndroid(),
      forcedSameTab: false,
      preserveNubo: true,
      launchedUrl: "",
      fallbackUrl: targetUrl,
      mobileLabel: preferMusic ? "YouTube Music" : label,
      launchBlocked: false,
      singleLaunchOwner: "nubo-direct-open-guard",
      build: "youtube-single-launch-v15-6-38-20260810",
    };
  }

  const launch = openExternal(targetUrl, label);

  return {
    ...(result as Record<string, unknown>),
    autoOpen: false,
    opened: launch.opened,
    mode: launch.mode,
    externalTab: launch.mode === "external-tab",
    youtubeAppPreferred: false,
    forcedSameTab: false,
    preserveNubo: true,
    launchedUrl: launch.launchedUrl,
    fallbackUrl: launch.fallbackUrl,
    mobileLabel: label,
    launchBlocked: false,
    build: "mobile-direct-open-v15-6-38-20260810",
  };
}
