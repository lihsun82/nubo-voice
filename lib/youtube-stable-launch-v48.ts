"use client";

const AUTO_RESUME_KEY = "nubo_voice_auto_resume_v1";
const EXTERNAL_RETURN_KEY = "nubo_external_app_return_v1";
const YOUTUBE_LAST_LAUNCH_KEY = "nubo_youtube_v49_last_launch";
const LAUNCH_DEDUP_MS = 30_000;

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

function wasRecentlyLaunched(signature: string, now: number) {
  if (signature === lastLaunchSignature && now - lastLaunchAt < LAUNCH_DEDUP_MS) {
    return true;
  }

  try {
    const saved = JSON.parse(window.localStorage.getItem(YOUTUBE_LAST_LAUNCH_KEY) || "null") as
      | { signature?: string; at?: number }
      | null;
    if (
      saved?.signature === signature &&
      typeof saved.at === "number" &&
      now - saved.at < LAUNCH_DEDUP_MS
    ) {
      return true;
    }
  } catch {
    // Corrupt/missing state must never block a fresh launch.
  }

  return false;
}

function rememberLaunch(signature: string, now: number) {
  lastLaunchSignature = signature;
  lastLaunchAt = now;
  try {
    window.localStorage.setItem(
      YOUTUBE_LAST_LAUNCH_KEY,
      JSON.stringify({ signature, at: now }),
    );
  } catch {}
}

export function launchYouTubeStableV48(targetOrQuery: string) {
  if (typeof window === "undefined") {
    throw new Error("目前不是瀏覽器環境");
  }

  const fallbackUrl = normalizeTarget(targetOrQuery);
  const launchUrl = isAndroidRuntime()
    ? buildHttpsIntent(fallbackUrl, "com.google.android.youtube")
    : fallbackUrl;

  const signature = fallbackUrl;
  const now = Date.now();

  // Keep NUBO voice eligible to resume when the user returns, but YouTube itself
  // is a one-shot handoff. Do not leave the old external-return flag armed or a
  // restored WebView/transcript can fire the same song again after YouTube is swiped away.
  window.localStorage.setItem(AUTO_RESUME_KEY, "true");
  window.localStorage.removeItem(EXTERNAL_RETURN_KEY);

  if (wasRecentlyLaunched(signature, now)) {
    return {
      ok: true,
      opened: false,
      duplicateSuppressed: true,
      route: "v49-stable-exact-once",
      mobileUrl: fallbackUrl,
      mobileLabel: "YouTube",
      autoOpen: false,
      launchMode: isAndroidRuntime() ? "android-intent" : "universal-link",
    };
  }

  rememberLaunch(signature, now);

  // Keep the proven 2026-08-01 stable handoff: Android intent URL directly to
  // the WebView/browser runtime. The target should now normally be an exact watch URL.
  window.setTimeout(() => {
    try {
      window.location.assign(launchUrl);
    } catch {
      window.location.assign(fallbackUrl);
    }
  }, 120);

  return {
    ok: true,
    opened: true,
    duplicateSuppressed: false,
    route: "v49-stable-exact-once",
    mobileUrl: fallbackUrl,
    mobileLabel: "YouTube",
    autoOpen: false,
    launchMode: isAndroidRuntime() ? "android-intent" : "universal-link",
  };
}
