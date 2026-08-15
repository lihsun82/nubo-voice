"use client";

const AUTO_RESUME_KEY = "nubo_voice_auto_resume_v1";
const EXTERNAL_RETURN_KEY = "nubo_external_app_return_v1";
const LAUNCH_DEDUP_MS = 1500;

let lastLaunchSignature = "";
let lastLaunchAt = 0;

function isAndroidRuntime() {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function buildHttpsIntent(url: string, packageName: string) {
  const parsed = new URL(url);
  const hostPath = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  return (
    `intent://${hostPath}` +
    `#Intent;scheme=${parsed.protocol.replace(":", "")};` +
    `package=${packageName};` +
    `S.browser_fallback_url=${encodeURIComponent(url)};end`
  );
}

function normalizeTarget(targetOrQuery: string) {
  const raw = String(targetOrQuery ?? "").trim();
  if (!raw) return "https://www.youtube.com/";
  if (isHttpUrl(raw)) return raw;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(raw)}`;
}

export function launchYouTubeStableV48(targetOrQuery: string) {
  if (typeof window === "undefined") {
    throw new Error("目前不是瀏覽器環境");
  }

  const fallbackUrl = normalizeTarget(targetOrQuery);
  const launchUrl = isAndroidRuntime()
    ? buildHttpsIntent(fallbackUrl, "com.google.android.youtube")
    : fallbackUrl;

  const signature = launchUrl;
  const now = Date.now();

  window.localStorage.setItem(AUTO_RESUME_KEY, "true");
  window.localStorage.setItem(EXTERNAL_RETURN_KEY, "true");

  if (signature !== lastLaunchSignature || now - lastLaunchAt > LAUNCH_DEDUP_MS) {
    lastLaunchSignature = signature;
    lastLaunchAt = now;

    // Restored from stable-2026-08-01-before-phone-agent-v2-bridge-fix:
    // hand the Android intent URL directly to the WebView/browser runtime.
    window.setTimeout(() => {
      try {
        window.location.assign(launchUrl);
      } catch {
        window.location.assign(fallbackUrl);
      }
    }, 120);
  }

  return {
    ok: true,
    opened: true,
    route: "v48-stable-2026-08-01-youtube-launch",
    mobileUrl: fallbackUrl,
    mobileLabel: "YouTube",
    autoOpen: false,
    launchMode: isAndroidRuntime() ? "android-intent" : "universal-link",
  };
}
