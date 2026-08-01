"use client";

export type NuboPhoneActionV2 = {
  app: string;
  label: string;
  universalUrl: string;
  androidIntentUrl?: string;
  fallbackUrl: string;
  returnUrl: string;
};

export type NuboPhoneLaunchResult = {
  ok: true;
  opened: true;
  phoneAgentV2: true;
  mobileUrl: string;
  mobileLabel: string;
  autoOpen: false;
  launchMode: "android-intent" | "universal-link" | "web-fallback";
  returnUrl: string;
};

export type NuboPhoneLaunchEventDetail = {
  app: string;
  label: string;
  manualUrl: string;
  webUrl: string;
  returnUrl: string;
  requestedAt: number;
};

export const NUBO_PHONE_LAUNCH_EVENT = "nubo-phone-agent-v2-launch";

const PHONE_AGENT_PENDING_KEY = "nubo_phone_agent_v2_pending";
const AUTO_RESUME_KEY = "nubo_voice_auto_resume_v1";
const EXTERNAL_RETURN_KEY = "nubo_external_app_return_v1";
const LAUNCH_DEDUP_MS = 1_500;

let lastLaunchSignature = "";
let lastLaunchAt = 0;

function normalizeAppName(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function sanitizePhoneNumber(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (!/^[+\d\s()\-]{3,30}$/.test(raw)) {
    throw new Error("電話號碼格式不正確");
  }
  return raw.replace(/[\s()\-]/g, "");
}

function sanitizeEmail(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
    throw new Error("Email格式不正確");
  }
  return raw;
}

function encodeIntentFallback(url: string) {
  return encodeURIComponent(url);
}

function buildHttpsIntent(url: string, packageName: string) {
  const parsed = new URL(url);
  const hostPath = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  return (
    `intent://${hostPath}` +
    `#Intent;scheme=${parsed.protocol.replace(":", "")};` +
    `package=${packageName};` +
    `S.browser_fallback_url=${encodeIntentFallback(url)};end`
  );
}

function buildCustomIntent(
  target: string,
  scheme: string,
  packageName: string,
  fallbackUrl: string,
) {
  return (
    `intent://${target}` +
    `#Intent;scheme=${scheme};` +
    `package=${packageName};` +
    `S.browser_fallback_url=${encodeIntentFallback(fallbackUrl)};end`
  );
}

function buildReturnUrl() {
  if (typeof window === "undefined") return "https://nubo.ainubo.com/";
  const url = new URL(window.location.origin);
  url.searchParams.set("phoneAgentReturn", "1");
  return url.toString();
}

function makeAction(
  app: string,
  label: string,
  universalUrl: string,
  androidIntentUrl?: string,
): NuboPhoneActionV2 {
  return {
    app,
    label,
    universalUrl,
    androidIntentUrl,
    fallbackUrl: universalUrl,
    returnUrl: buildReturnUrl(),
  };
}

export function isNuboMobileRuntime() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const coarsePointer = window
    .matchMedia("(pointer: coarse) and (max-width: 1100px)")
    .matches;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true);

  return mobileUserAgent || coarsePointer || standalone;
}

function isAndroidRuntime() {
  return (
    typeof navigator !== "undefined" &&
    /Android/i.test(navigator.userAgent || "")
  );
}

export function resolveNuboPhoneActionV2(
  appValue: unknown,
  queryValue?: unknown,
  valueValue?: unknown,
): NuboPhoneActionV2 {
  if (typeof window === "undefined") {
    throw new Error("目前不是瀏覽器環境");
  }

  const app = normalizeAppName(appValue);
  const query = String(queryValue ?? "").trim();
  const value = String(valueValue ?? "").trim();

  if (["line", "賴"].includes(app)) {
    const fallback = "https://line.me/R/nv/chat";
    return makeAction(
      "line",
      "LINE",
      fallback,
      buildCustomIntent(
        "nv/chat",
        "line",
        "jp.naver.line.android",
        fallback,
      ),
    );
  }

  if (["facebook", "fb", "臉書"].includes(app)) {
    const fallback = query
      ? isHttpUrl(query)
        ? query
        : `https://www.facebook.com/${encodeURIComponent(query)}`
      : "https://www.facebook.com/";
    return makeAction(
      "facebook",
      "Facebook",
      fallback,
      buildHttpsIntent(fallback, "com.facebook.katana"),
    );
  }

  if (["instagram", "ig"].includes(app)) {
    const account = query.replace(/^@/, "");
    const fallback = query
      ? isHttpUrl(query)
        ? query
        : `https://www.instagram.com/${encodeURIComponent(account)}/`
      : "https://www.instagram.com/";
    return makeAction(
      "instagram",
      "Instagram",
      fallback,
      buildHttpsIntent(fallback, "com.instagram.android"),
    );
  }

  if (["maps", "googlemaps", "地圖", "google地圖", "導航"].includes(app)) {
    const fallback = query
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
      : "https://www.google.com/maps/";
    const target = query
      ? `0,0?q=${encodeURIComponent(query)}`
      : "0,0?q=";
    return makeAction(
      "maps",
      "Google Maps",
      fallback,
      buildCustomIntent(
        target,
        "geo",
        "com.google.android.apps.maps",
        fallback,
      ),
    );
  }

  if (["youtube", "yt", "油管"].includes(app)) {
    const fallback = query
      ? isHttpUrl(query)
        ? query
        : `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      : "https://www.youtube.com/";
    return makeAction(
      "youtube",
      "YouTube",
      fallback,
      buildHttpsIntent(fallback, "com.google.android.youtube"),
    );
  }

  if (["youtubemusic", "ytmusic", "youtube音樂"].includes(app)) {
    const fallback = query
      ? isHttpUrl(query)
        ? query
        : `https://music.youtube.com/search?q=${encodeURIComponent(query)}`
      : "https://music.youtube.com/";
    return makeAction(
      "youtube_music",
      "YouTube Music",
      fallback,
      buildHttpsIntent(
        fallback,
        "com.google.android.apps.youtube.music",
      ),
    );
  }

  if (["gmail", "googlemail"].includes(app)) {
    const fallback = "https://mail.google.com/";
    return makeAction(
      "gmail",
      "Gmail",
      fallback,
      buildHttpsIntent(fallback, "com.google.android.gm"),
    );
  }

  if (["google", "browser", "chrome", "瀏覽器"].includes(app)) {
    const fallback = query
      ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
      : "https://www.google.com/";
    return makeAction(
      "google",
      "Google",
      fallback,
      buildHttpsIntent(fallback, "com.android.chrome"),
    );
  }

  if (["spotify", "spotify音樂"].includes(app)) {
    const fallback = query
      ? `https://open.spotify.com/search/${encodeURIComponent(query)}`
      : "https://open.spotify.com/";
    return makeAction(
      "spotify",
      "Spotify",
      fallback,
      buildHttpsIntent(fallback, "com.spotify.music"),
    );
  }

  if (["calculator", "calc", "計算機", "計算器"].includes(app)) {
    const fallback = `${window.location.origin}/mobile-tools/calculator`;
    return makeAction("calculator", "NUBO 計算機", fallback);
  }

  if (["phone", "dialer", "電話", "撥號"].includes(app)) {
    const phone = sanitizePhoneNumber(value);
    const url = phone ? `tel:${phone}` : "tel:";
    return makeAction("phone", "電話", url);
  }

  if (["sms", "message", "簡訊", "訊息"].includes(app)) {
    const phone = sanitizePhoneNumber(value);
    const url = phone ? `sms:${phone}` : "sms:";
    return makeAction("sms", "簡訊", url);
  }

  if (["email", "mail", "電子郵件"].includes(app)) {
    const email = sanitizeEmail(value);
    const url = email ? `mailto:${encodeURIComponent(email)}` : "mailto:";
    return makeAction("email", "Email", url);
  }

  throw new Error(
    "NUBO Phone Agent V2目前支援LINE、Facebook、Instagram、Google Maps、YouTube、YouTube Music、Gmail、Google、Spotify、計算機、電話、簡訊與Email。",
  );
}

export function resolveWebsiteTargetAsPhoneApp(targetValue: unknown) {
  const raw = String(targetValue ?? "").trim();
  const normalized = normalizeAppName(raw);

  const aliases: Array<[string[], string]> = [
    [["line", "賴"], "line"],
    [["facebook", "fb", "臉書"], "facebook"],
    [["instagram", "ig"], "instagram"],
    [["maps", "googlemaps", "地圖", "google地圖", "導航"], "maps"],
    [["youtubemusic", "ytmusic", "youtube音樂"], "youtube_music"],
    [["youtube", "yt", "油管"], "youtube"],
    [["gmail", "googlemail"], "gmail"],
    [["google", "chrome", "瀏覽器"], "google"],
    [["spotify", "spotify音樂"], "spotify"],
  ];

  for (const [keys, app] of aliases) {
    if (keys.includes(normalized)) return { app, query: "" };
  }

  if (!isHttpUrl(raw)) return null;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host.includes("facebook.com")) {
      return { app: "facebook", query: raw };
    }
    if (host.includes("instagram.com")) {
      return { app: "instagram", query: raw };
    }
    if (host.includes("music.youtube.com")) {
      return { app: "youtube_music", query: raw };
    }
    if (host.includes("youtube.com") || host === "youtu.be") {
      return { app: "youtube", query: raw };
    }
    if (host.includes("google.com") && url.pathname.includes("maps")) {
      return { app: "maps", query: raw };
    }
    if (host.includes("mail.google.com")) {
      return { app: "gmail", query: raw };
    }
    if (host.includes("open.spotify.com")) {
      return { app: "spotify", query: raw };
    }
  } catch {
    return null;
  }

  return null;
}

function dispatchLaunchEvent(detail: NuboPhoneLaunchEventDetail) {
  window.dispatchEvent(
    new CustomEvent<NuboPhoneLaunchEventDetail>(
      NUBO_PHONE_LAUNCH_EVENT,
      { detail },
    ),
  );
}

function navigateTopLevelReliably(primaryUrl: string, fallbackUrl: string) {
  const initialUrl = window.location.href;
  const anchor = document.createElement("a");
  anchor.href = primaryUrl;
  anchor.target = "_self";
  anchor.rel = "external";
  anchor.setAttribute("aria-hidden", "true");
  anchor.style.display = "none";
  document.body?.appendChild(anchor);

  const assign = (url: string) => {
    try {
      window.location.href = url;
      return;
    } catch {
      // Continue to the next browser navigation API.
    }

    try {
      window.location.assign(url);
    } catch {
      // The visible manual-launch card remains available.
    }
  };

  /*
   * Do the top-level navigation synchronously. Previous versions delayed it
   * with setTimeout, which made Chrome/PWA treat the action as detached from
   * the active voice interaction and could silently ignore it.
   */
  assign(primaryUrl);

  window.setTimeout(() => {
    if (
      document.visibilityState !== "visible" ||
      window.location.href !== initialUrl
    ) {
      anchor.remove();
      return;
    }

    try {
      anchor.click();
    } catch {
      // The visible manual-launch card remains available.
    }
  }, 80);

  window.setTimeout(() => {
    anchor.remove();

    if (
      document.visibilityState !== "visible" ||
      window.location.href !== initialUrl ||
      !fallbackUrl ||
      fallbackUrl === primaryUrl
    ) {
      return;
    }

    assign(fallbackUrl);
  }, 700);
}

export function launchNuboPhoneActionV2(
  action: NuboPhoneActionV2,
): NuboPhoneLaunchResult {
  if (typeof window === "undefined") {
    throw new Error("目前不是瀏覽器環境");
  }

  const automaticLaunchUrl = action.universalUrl || action.fallbackUrl;
  const manualLaunchUrl =
    isAndroidRuntime() && action.androidIntentUrl
      ? action.androidIntentUrl
      : action.universalUrl;
  const signature = `${action.app}:${automaticLaunchUrl}`;
  const now = Date.now();

  window.localStorage.setItem(AUTO_RESUME_KEY, "true");
  window.localStorage.setItem(EXTERNAL_RETURN_KEY, "true");
  window.localStorage.setItem(
    PHONE_AGENT_PENDING_KEY,
    JSON.stringify({
      app: action.app,
      label: action.label,
      manualUrl: manualLaunchUrl,
      webUrl: action.fallbackUrl,
      returnUrl: action.returnUrl,
      startedAt: new Date(now).toISOString(),
    }),
  );

  dispatchLaunchEvent({
    app: action.app,
    label: action.label,
    manualUrl: manualLaunchUrl,
    webUrl: action.fallbackUrl,
    returnUrl: action.returnUrl,
    requestedAt: now,
  });

  const launchMode: NuboPhoneLaunchResult["launchMode"] =
    isHttpUrl(automaticLaunchUrl)
      ? "universal-link"
      : "web-fallback";

  if (
    signature !== lastLaunchSignature ||
    now - lastLaunchAt > LAUNCH_DEDUP_MS
  ) {
    lastLaunchSignature = signature;
    lastLaunchAt = now;
    navigateTopLevelReliably(automaticLaunchUrl, action.fallbackUrl);
  }

  return {
    ok: true,
    opened: true,
    phoneAgentV2: true,
    mobileUrl: manualLaunchUrl,
    mobileLabel: action.label,
    autoOpen: false,
    launchMode,
    returnUrl: action.returnUrl,
  };
}
