"use client";

import type { FunctionCall } from "@/lib/browser-nubo-tools";

type MobileLaunchPlan = {
  primaryUrl: string;
  fallbackUrl: string;
  appLink: boolean;
  preserveNubo: boolean;
  externalTab: boolean;
};

const LEGACY_MOBILE_OPEN_STYLE_ID =
  "nubo-hide-legacy-mobile-open-v14";

function getMobileOpenLabel(targetUrl: string, callName: string) {
  const normalizedUrl = targetUrl.toLowerCase();

  if (normalizedUrl.includes("line.me") || normalizedUrl.startsWith("line:")) {
    return "LINE";
  }
  if (normalizedUrl.includes("facebook.com") || normalizedUrl.includes("fb.com")) {
    return "Facebook";
  }
  if (
    normalizedUrl.includes("instagram.com") ||
    normalizedUrl.startsWith("instagram:")
  ) {
    return "Instagram";
  }
  if (normalizedUrl.includes("music.youtube.com")) {
    return "YouTube Music";
  }
  if (normalizedUrl.includes("youtube.com") || normalizedUrl.includes("youtu.be")) {
    return "YouTube";
  }
  if (
    normalizedUrl.includes("maps.google.") ||
    normalizedUrl.includes("google.com/maps")
  ) {
    return "Google Maps";
  }
  if (normalizedUrl.includes("mail.google.com")) {
    return "Gmail";
  }
  if (normalizedUrl.includes("google.com")) {
    return "Google";
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

  if (!targetUrl && /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) {
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

    const queryId = url.searchParams.get("v") ?? "";
    if (queryId) return queryId;

    if (url.pathname.startsWith("/shorts/")) {
      return url.pathname.split("/").filter(Boolean)[1] ?? "";
    }

    return "";
  } catch {
    return "";
  }
}

function androidNativeIntent(
  intentPath: string,
  scheme: string,
  packageName: string,
  browserFallbackUrl = "",
) {
  const fallback = browserFallbackUrl
    ? `S.browser_fallback_url=${encodeURIComponent(browserFallbackUrl)};`
    : "";

  return (
    `intent://${intentPath}` +
    `#Intent;scheme=${scheme};package=${packageName};` +
    fallback +
    "action=android.intent.action.VIEW;" +
    "category=android.intent.category.BROWSABLE;end"
  );
}

function canonicalYouTubeUrl(videoId: string) {
  return videoId
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&autoplay=1`
    : "https://www.youtube.com/";
}

function androidYouTubeWatchIntent(videoId: string) {
  const watchPath =
    "www.youtube.com/watch?v=" +
    encodeURIComponent(videoId) +
    "&autoplay=1";

  return androidNativeIntent(
    watchPath,
    "https",
    "com.google.android.youtube",
  );
}

function buildMobileLaunchPlan(
  targetUrl: string,
  label: string,
): MobileLaunchPlan {
  const normalizedLabel = label.toLowerCase();
  const normalizedUrl = targetUrl.toLowerCase();
  const android = isAndroidMobile();
  const apple = isAppleMobile();

  if (/^(tel|sms|mailto):/i.test(targetUrl)) {
    return {
      primaryUrl: targetUrl,
      fallbackUrl: targetUrl,
      appLink: true,
      preserveNubo: true,
      externalTab: false,
    };
  }

  if (normalizedLabel === "line" || normalizedUrl.includes("line.me/")) {
    return {
      primaryUrl: android
        ? androidNativeIntent(
            "nv/chat",
            "line",
            "jp.naver.line.android",
            targetUrl,
          )
        : apple
          ? "line://nv/chat"
          : targetUrl,
      fallbackUrl: targetUrl,
      appLink: android || apple,
      preserveNubo: true,
      externalTab: !(android || apple),
    };
  }

  if (
    normalizedLabel === "youtube music" ||
    normalizedLabel === "youtube" ||
    normalizedUrl.includes("music.youtube.com") ||
    normalizedUrl.includes("youtube.com") ||
    normalizedUrl.includes("youtu.be")
  ) {
    const videoId = extractYouTubeVideoId(targetUrl);
    const youtubeUrl = canonicalYouTubeUrl(videoId);

    return {
      primaryUrl: android
        ? videoId
          ? androidYouTubeWatchIntent(videoId)
          : androidNativeIntent(
              "www.youtube.com/",
              "https",
              "com.google.android.youtube",
              youtubeUrl,
            )
        : apple
          ? videoId
            ? `youtube://watch?v=${encodeURIComponent(videoId)}`
            : "youtube://"
          : youtubeUrl,
      fallbackUrl: youtubeUrl,
      appLink: android || apple,
      preserveNubo: true,
      externalTab: !(android || apple),
    };
  }

  /*
   * Facebook、Instagram、Google Maps、Gmail、Google及一般網站
   * 一律使用另一個瀏覽器分頁。不得以App Intent或目前頁面取代NUBO。
   */
  return {
    primaryUrl: targetUrl,
    fallbackUrl: targetUrl,
    appLink: false,
    preserveNubo: true,
    externalTab: true,
  };
}

function hideLegacyClickRelays() {
  if (typeof document === "undefined") return;

  if (!document.getElementById(LEGACY_MOBILE_OPEN_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = LEGACY_MOBILE_OPEN_STYLE_ID;
    style.textContent = `
      #nubo-mobile-open-fallback,
      .mobile-youtube-action,
      [data-nubo-mobile-open-fallback],
      [data-nubo-mobile-open-dialog] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  document.getElementById("nubo-mobile-open-fallback")?.remove();
}

function openExternalWebsiteWithoutReplacingNubo(targetUrl: string) {
  try {
    const opened = window.open(
      targetUrl,
      "nubo_mobile_external",
    );

    if (opened) {
      try {
        opened.focus();
      } catch {
        // 跨來源外部分頁不可控制時忽略。
      }
      return true;
    }
  } catch {
    // 新分頁被阻擋時保留NUBO，不改用目前頁面。
  }

  window.dispatchEvent(
    new CustomEvent("nubo-external-tab-blocked", {
      detail: { url: targetUrl },
    }),
  );
  return false;
}

function launchMobileTarget(targetUrl: string, label: string) {
  const plan = buildMobileLaunchPlan(targetUrl, label);
  hideLegacyClickRelays();

  if (plan.externalTab) {
    const opened = openExternalWebsiteWithoutReplacingNubo(plan.fallbackUrl);
    return { plan, opened };
  }

  if (plan.appLink) {
    try {
      window.location.href = plan.primaryUrl;
      return { plan, opened: true };
    } catch {
      return { plan, opened: false };
    }
  }

  const opened = openExternalWebsiteWithoutReplacingNubo(plan.primaryUrl);
  return { plan, opened };
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

  const { plan: launchPlan, opened } = launchMobileTarget(targetUrl, label);

  if (launchPlan.appLink) {
    window.localStorage.setItem("nubo_external_app_return_v1", "true");
  } else {
    window.localStorage.removeItem("nubo_external_app_return_v1");
  }

  return {
    ...(result as Record<string, unknown>),
    autoOpen: false,
    opened,
    mode: launchPlan.externalTab
      ? "mobile-external-tab-v14"
      : "mobile-app-link-v14",
    forcedSameTab: false,
    externalTab: launchPlan.externalTab,
    appLinkAttempted: launchPlan.appLink,
    launchedUrl: launchPlan.primaryUrl,
    fallbackUrl: launchPlan.fallbackUrl,
    fallbackScheduled: false,
    preserveNubo: true,
    mobileUrl: undefined,
    playerUrl: undefined,
    mobileLabel: label === "YouTube Music" ? "YouTube" : label,
    build: "mobile-external-tab-v14-20260802",
  };
}
