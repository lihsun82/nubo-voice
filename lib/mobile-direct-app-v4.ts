"use client";

import type { FunctionCall } from "@/lib/browser-nubo-tools";

type MobileLaunchPlan = {
  primaryUrl: string;
  fallbackUrl: string;
  appLink: boolean;
  preserveNubo: boolean;
};

type MobileLaunchResult = MobileLaunchPlan & {
  nativeBridge: boolean;
};

type NuboNativeBridge = {
  openExternalApp: (targetUrl: string, label: string) => boolean;
  isNativeApp?: () => boolean;
};

declare global {
  interface Window {
    NuboNative?: NuboNativeBridge;
  }
}

const LEGACY_MOBILE_OPEN_STYLE_ID =
  "nubo-hide-legacy-mobile-open-v6";

function getMobileOpenLabel(targetUrl: string, callName: string) {
  const normalizedUrl = targetUrl.toLowerCase();

  if (normalizedUrl.includes("line.me") || normalizedUrl.startsWith("line:")) {
    return "LINE";
  }
  if (normalizedUrl.includes("facebook.com") || normalizedUrl.includes("fb.com")) {
    return "Facebook";
  }
  if (normalizedUrl.includes("instagram.com") || normalizedUrl.startsWith("instagram:")) {
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
) {
  return (
    `intent://${intentPath}` +
    `#Intent;scheme=${scheme};package=${packageName};` +
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
    };
  }

  if (normalizedLabel === "line" || normalizedUrl.includes("line.me/")) {
    return {
      primaryUrl: android
        ? androidNativeIntent(
            "nv/chat",
            "line",
            "jp.naver.line.android",
          )
        : apple
          ? "line://nv/chat"
          : targetUrl,
      fallbackUrl: targetUrl,
      appLink: android || apple,
      preserveNubo: true,
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
            )
        : apple
          ? videoId
            ? `youtube://watch?v=${encodeURIComponent(videoId)}`
            : "youtube://"
          : youtubeUrl,
      fallbackUrl: youtubeUrl,
      appLink: android || apple,
      preserveNubo: true,
    };
  }

  if (
    normalizedLabel === "facebook" ||
    normalizedUrl.includes("facebook.com") ||
    normalizedUrl.includes("fb.com")
  ) {
    return {
      primaryUrl: android
        ? androidNativeIntent(
            `facewebmodal/f?href=${encodeURIComponent(targetUrl)}`,
            "fb",
            "com.facebook.katana",
          )
        : apple
          ? `fb://facewebmodal/f?href=${encodeURIComponent(targetUrl)}`
          : targetUrl,
      fallbackUrl: targetUrl,
      appLink: android || apple,
      preserveNubo: true,
    };
  }

  if (
    normalizedLabel === "instagram" ||
    normalizedUrl.includes("instagram.com")
  ) {
    return {
      primaryUrl: android
        ? androidNativeIntent(
            "app/",
            "instagram",
            "com.instagram.android",
          )
        : apple
          ? "instagram://app"
          : targetUrl,
      fallbackUrl: targetUrl,
      appLink: android || apple,
      preserveNubo: true,
    };
  }

  return {
    primaryUrl: targetUrl,
    fallbackUrl: targetUrl,
    appLink: false,
    preserveNubo: true,
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

  for (const element of Array.from(
    document.querySelectorAll<HTMLElement>("body *"),
  )) {
    const text = element.textContent?.trim() ?? "";
    if (
      text === "點我開啟YouTube" ||
      text === "點我開啟 YouTube" ||
      /^mobile-web-open-v\d+-/i.test(text)
    ) {
      const dialog =
        element.closest<HTMLElement>(
          '[role="dialog"], [data-nubo-mobile-open-dialog], .mobile-open-dialog',
        ) ?? element.parentElement;
      dialog?.remove();
    }
  }
}

function openExternalWebsiteWithoutReplacingNubo(targetUrl: string) {
  try {
    const opened = window.open(
      targetUrl,
      "nubo_mobile_external",
      "noopener,noreferrer",
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
    // 手機瀏覽器阻擋新分頁時維持NUBO，不覆蓋主頁。
  }

  return false;
}

function tryNativeBridgeOpen(targetUrl: string, label: string) {
  const bridge = window.NuboNative;

  if (!bridge || typeof bridge.openExternalApp !== "function") {
    return false;
  }

  try {
    return bridge.openExternalApp(targetUrl, label) !== false;
  } catch {
    return false;
  }
}

function launchMobileTarget(
  targetUrl: string,
  label: string,
): MobileLaunchResult {
  const plan = buildMobileLaunchPlan(targetUrl, label);
  hideLegacyClickRelays();

  /*
   * NUBO Android App會注入受限原生橋接。
   * 由原生Activity啟動YouTube、LINE、IG與Facebook，
   * 不經Chrome，因此不會出現瀏覽器的「繼續使用App」提示。
   */
  if (tryNativeBridgeOpen(targetUrl, label)) {
    return {
      ...plan,
      appLink: true,
      nativeBridge: true,
    };
  }

  if (plan.appLink) {
    try {
      /*
       * 純網頁模式維持原有相容流程。
       * Android瀏覽器可能依系統安全政策顯示App確認提示。
       */
      window.location.href = plan.primaryUrl;
    } catch {
      // App啟動遭系統封鎖時，維持NUBO頁面，不顯示二次點擊視窗。
    }

    return {
      ...plan,
      nativeBridge: false,
    };
  }

  openExternalWebsiteWithoutReplacingNubo(plan.primaryUrl);
  return {
    ...plan,
    nativeBridge: false,
  };
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
    mode: launchPlan.nativeBridge
      ? "android-native-app-v8"
      : "mobile-web-intent-v8",
    forcedSameTab: false,
    appLinkAttempted: launchPlan.appLink,
    nativeBridgeUsed: launchPlan.nativeBridge,
    launchedUrl: launchPlan.primaryUrl,
    fallbackUrl: launchPlan.fallbackUrl,
    preserveNubo: launchPlan.preserveNubo,
    mobileUrl: undefined,
    playerUrl: undefined,
    mobileLabel:
      label === "YouTube Music" ? "YouTube" : label,
    build: "android-native-launch-v8-20260802",
  };
}
