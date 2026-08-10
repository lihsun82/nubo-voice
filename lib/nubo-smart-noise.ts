"use client";

export type NuboNoiseReductionType = "near_field" | "far_field";

function isCoarseMobileDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") ||
    window.matchMedia?.("(pointer: coarse) and (max-width: 1100px)").matches === true
  );
}

export function isNuboNativeAndroid() {
  if (typeof window === "undefined") return false;
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
  // NUBO is commonly used on a counter/table or handheld in public spaces.
  // Mobile/native devices therefore default to far-field cleanup; desktop
  // close-talk microphones keep the lower-latency near-field profile.
  return isNuboNativeAndroid() || isCoarseMobileDevice() ? "far_field" : "near_field";
}

export function getNuboMicrophoneConstraints(): MediaTrackConstraints {
  const supported =
    typeof navigator !== "undefined"
      ? navigator.mediaDevices?.getSupportedConstraints?.() ?? {}
      : {};

  const constraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
  };

  if (supported.sampleSize) constraints.sampleSize = { ideal: 16 };
  if (supported.latency) constraints.latency = { ideal: 0.02, max: 0.12 };

  return constraints;
}

export function getNuboNoiseProfileLabel() {
  return getNuboNoiseReductionType() === "far_field"
    ? "智慧遠場降噪"
    : "智慧近場降噪";
}
