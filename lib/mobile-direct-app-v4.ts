"use client";

import type { FunctionCall } from "@/lib/browser-nubo-tools";

type MobileLaunchPlan = {
  primaryUrl: string;
  fallbackUrl: string;
  fallbackDelayMs: number;
  appLink: boolean;
};

function getMobileOpenLabel(targetUrl: string, callName: string) {
  const normalizedUrl = targetUrl.toLowerCase();

  if (normalizedUrl.includes("line.me") || normalizedUrl.startsWith("line:")) {
    return "LINE";
  }
  if (normalizedUrl.includes("facebook.com") || normalizedUrl.includes("fb.com")) {
    return "Facebook";
  }
  if (normalizedUrl.includes("instagram.com")) {
    return "Instagram";
  }
  if (normalizedUrl.includes("music.youtube.com")) {
    return "YouTube Music";
  }
  if (normalizedUrl.includes("youtube.com") || normalizedUrl.includes("youtu.be")) {
    return "YouTube";
  }
  if (normalizedUrl.includes("maps.google.") || normalizedUrl.includes("google.com/maps")) {
    return "Google Maps";
  }
  if (normalizedUrl.includes("mail.google.com")) {
    return "Gmail";
  }
  if (callName === "open_website") {
    return "網站";
  }
  return "手機工具";
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

  if (!targetUrl && /^https?:\/\//i.test(raw)) {
    const parsed = new URL(raw);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("只允許開啟HTTP或HTTPS網址");
    }

    targetUrl = parsed.toString();
  }

  if (
    !targetUrl &&
    /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)
  ) {
    targetUrl = new URL(`https://${raw}`).toString();
  }

  if (!targetUrl) {
    targetUrl =
      "https://www.google.com/search?q=" +
      encodeURIComponent(raw);
  }

  return {
    ok: true,
    mobileUrl: targetUrl,
    mobileLabel: getMobileOpenLabel(targetUrl, "open_website"),
    autoOpen: true,
    supported: true,
  };
}

function isAndroidMobile() {
  return /Android/i.test(window.navigator.userAgent || "");
}

function isAppleMobile() {
  return /iPhone|iPad|iPod/i.test(window.navigator.userAgent || "");
}

function extractYouTubeVideoId(targetUrl: string) {
  try {
    const url = new URL(targetUrl, window.location.origin);

    if (url.hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? "";
    }

    return url.searchParams.get("v") ?? "";
  } catch {
    return "";
  }
}

function androidIntent(
  intentPath: string,
  scheme: string,
  packageName: string,
  fallbackUrl: string,
) {
  return (
    `intent://${intentPath}` +
    `#Intent;scheme=${scheme};package=${packageName};` +
    `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`
  );
}

function buildMobileLaunchPlan(
  targetUrl: string,
  label: string,
): MobileLaunchPlan {
  const fallbackUrl = targetUrl;
  const normalizedLabel = label.toLowerCase();
  const normalizedUrl = targetUrl.toLowerCase();
  const android = isAndroidMobile();
  const apple = isAppleMobile();

  if (/^(tel|sms|mailto):/i.test(targetUrl)) {
    return {
      primaryUrl: targetUrl,
      fallbackUrl,
      fallbackDelayMs: 0,
      appLink: true,
    };
  }

  if (normalizedLabel === "line" || normalizedUrl.includes("line.me/")) {
    return {
      primaryUrl: android
        ? androidIntent(
            "nv/chat",
            "line",
            "jp.naver.line.android",
            fallbackUrl,
          )
        : apple
          ? "line://nv/chat"
          : fallbackUrl,
      fallbackUrl,
      fallbackDelayMs: android ? 2200 : apple ? 1400 : 0,
      appLink: android || apple,
    };
  }

  if (
    normalizedLabel === "youtube music" ||
    normalizedUrl.includes("music.youtube.com")
  ) {
    const videoId = extractYouTubeVideoId(targetUrl);
    const musicPath = videoId
      ? `music.youtube.com/watch?v=${encodeURIComponent(videoId)}`
      : "music.youtube.com/";

    return {
      primaryUrl: android
        ? androidIntent(
            musicPath,
            "https",
            "com.google.android.apps.youtube.music",
            fallbackUrl,
          )
        : fallbackUrl,
      fallbackUrl,
      fallbackDelayMs: android ? 2200 : 0,
      appLink: android,
    };
  }

  if (
    normalizedLabel === "youtube" ||
    normalizedUrl.includes("youtube.com") ||
    normalizedUrl.includes("youtu.be")
  ) {
    const videoId = extractYouTubeVideoId(targetUrl);
    const watchPath = videoId
      ? `www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
      : "www.youtube.com/";

    return {
      primaryUrl: android
        ? androidIntent(
            watchPath,
            "https",
            "com.google.android.youtube",
            fallbackUrl,
          )
        : apple
          ? videoId
            ? `youtube://watch?v=${encodeURIComponent(videoId)}`
            : "youtube://"
          : fallbackUrl,
      fallbackUrl,
      fallbackDelayMs: android ? 2200 : apple ? 1500 : 0,
      appLink: android || apple,
    };
  }

  if (
    normalizedLabel === "facebook" ||
    normalizedUrl.includes("facebook.com") ||
    normalizedUrl.includes("fb.com")
  ) {
    return {
      primaryUrl: android
        ? androidIntent(
            "www.facebook.com/",
            "https",
            "com.facebook.katana",
            fallbackUrl,
          )
        : apple
          ? `fb://facewebmodal/f?href=${encodeURIComponent(fallbackUrl)}`
          : fallbackUrl,
      fallbackUrl,
      fallbackDelayMs: android ? 2200 : apple ? 1400 : 0,
      appLink: android || apple,
    };
  }

  if (
    normalizedLabel === "instagram" ||
    normalizedUrl.includes("instagram.com")
  ) {
    return {
      primaryUrl: android
        ? androidIntent(
            "instagram.com/",
            "https",
            "com.instagram.android",
            fallbackUrl,
          )
        : apple
          ? "instagram://app"
          : fallbackUrl,
      fallbackUrl,
      fallbackDelayMs: android ? 2200 : apple ? 1400 : 0,
      appLink: android || apple,
    };
  }

  return {
    primaryUrl: targetUrl,
    fallbackUrl,
    fallbackDelayMs: 0,
    appLink: false,
  };
}

function launchMobileTarget(
  targetUrl: string,
  label: string,
) {
  const plan = buildMobileLaunchPlan(targetUrl, label);
  let backgrounded = false;
  let fallbackTimer: number | null = null;

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      backgrounded = true;

      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange, {
    once: true,
  });

  if (
    plan.appLink &&
    plan.fallbackDelayMs > 0 &&
    plan.primaryUrl !== plan.fallbackUrl
  ) {
    fallbackTimer = window.setTimeout(() => {
      if (!backgrounded && document.visibilityState === "visible") {
        window.location.assign(plan.fallbackUrl);
      }
    }, plan.fallbackDelayMs);
  }

  try {
    window.location.assign(plan.primaryUrl);
  } catch {
    window.location.href = plan.fallbackUrl;
  }

  return plan;
}

export function forceDirectMobileOpen(result: unknown, callName: string) {
  if (typeof window === "undefined") return result;
  if (!result || typeof result !== "object") return result;

  const payload = result as {
    mobileUrl?: unknown;
    mobileLabel?: unknown;
    url?: unknown;
  };
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

  const launchPlan = launchMobileTarget(targetUrl, label);

  return {
    ...(result as Record<string, unknown>),
    autoOpen: false,
    opened: true,
    mode: "direct-app-or-same-tab",
    forcedSameTab: true,
    appLinkAttempted: launchPlan.appLink,
    launchedUrl: launchPlan.primaryUrl,
    fallbackUrl: launchPlan.fallbackUrl,
    mobileUrl: undefined,
    playerUrl: undefined,
    mobileLabel: label,
  };
}
