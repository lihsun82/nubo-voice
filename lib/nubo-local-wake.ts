"use client";

type NuboNativeWakeBridge = {
  isNativeApp?: () => boolean;
  openExternalApp?: (targetUrl: string, label: string) => boolean;
};

type NuboWakeWindow = Window & {
  NuboNative?: NuboNativeWakeBridge;
};

function isAndroidNuboShell() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const nativeMarker = document.documentElement.dataset.nuboNative ?? "";
  const ua = window.navigator.userAgent ?? "";
  return nativeMarker.startsWith("android") || /NUBO-Android|Android/i.test(ua);
}

/**
 * Starts/stops the separate NUBO Wake companion app. This does not send
 * microphone audio to Gemini; the companion performs local KWS only.
 *
 * We intentionally do not navigate the current page as a fallback. If the
 * companion is not installed yet, NUBO simply stays in its normal quiet eco
 * state instead of breaking the Google Home baseline shell.
 */
export function controlNuboLocalWake(action: "start" | "stop") {
  if (!isAndroidNuboShell()) return false;

  try {
    const bridge = (window as NuboWakeWindow).NuboNative;
    if (typeof bridge?.openExternalApp !== "function") return false;
    return bridge.openExternalApp(`nubowake://${action}`, "手機工具") === true;
  } catch {
    return false;
  }
}
