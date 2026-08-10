"use client";

export type NuboNoiseReductionType = "near_field" | "far_field";

function isCoarseMobileDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") ||
    window.matchMedia("(pointer: coarse) and (max-width: 1100px)").matches
  );
}

export function isNuboNativeAndroid() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const nativeWindow = window as Window & {
    NuboNative?: { isNativeApp?: () => boolean };
  };

  try {
    if (nativeWindow.NuboNative?.isNativeApp?.() === true) return true;
  } catch {
    // Ignore bridge probing errors and fall back to the DOM/user-agent marker.
  }

  return (
    document.documentElement.dataset.nuboNative?.startsWith("android-") === true ||
    /NUBO-Android\//i.test(navigator.userAgent || "")
  );
}

export function getNuboNoiseReductionType(): NuboNoiseReductionType {
  return isNuboNativeAndroid() || isCoarseMobileDevice() ? "far_field" : "near_field";
}

export function getNuboMicrophoneConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48000,
  };
}

export function getNuboNoiseProfileLabel() {
  return getNuboNoiseReductionType() === "far_field"
    ? "智慧遠場降噪"
    : "智慧近場降噪";
}
