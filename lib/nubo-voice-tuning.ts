export const NUBO_VOICE_TUNING_STORAGE_KEY = "nubo_voice_tuning_v1";
export const NUBO_VOICE_TUNING_EVENT = "nubo:voice-tuning-change";

export type NuboVoiceTuning = {
  speed: number;
  brightness: number;
  warmth: number;
  presence: number;
  compression: number;
  outputGain: number;
};

export const NUBO_DEFAULT_VOICE_TUNING: NuboVoiceTuning = {
  speed: 1,
  brightness: 2,
  warmth: -2,
  presence: 2,
  compression: 35,
  outputGain: 1,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeNuboVoiceTuning(
  value: Partial<NuboVoiceTuning> | null | undefined,
): NuboVoiceTuning {
  return {
    speed: clamp(Number(value?.speed ?? 1), 0.85, 1.15),
    brightness: clamp(Number(value?.brightness ?? 2), -8, 8),
    warmth: clamp(Number(value?.warmth ?? -2), -8, 8),
    presence: clamp(Number(value?.presence ?? 2), -8, 8),
    compression: clamp(Number(value?.compression ?? 35), 0, 100),
    outputGain: clamp(Number(value?.outputGain ?? 1), 0.7, 1.3),
  };
}

export function readNuboVoiceTuning(): NuboVoiceTuning {
  if (typeof window === "undefined") return NUBO_DEFAULT_VOICE_TUNING;

  try {
    const raw = window.localStorage.getItem(NUBO_VOICE_TUNING_STORAGE_KEY);
    return normalizeNuboVoiceTuning(raw ? JSON.parse(raw) : null);
  } catch {
    return NUBO_DEFAULT_VOICE_TUNING;
  }
}

export function saveNuboVoiceTuning(value: NuboVoiceTuning) {
  if (typeof window === "undefined") return;
  const normalized = normalizeNuboVoiceTuning(value);
  window.localStorage.setItem(
    NUBO_VOICE_TUNING_STORAGE_KEY,
    JSON.stringify(normalized),
  );
  window.dispatchEvent(
    new CustomEvent<NuboVoiceTuning>(NUBO_VOICE_TUNING_EVENT, {
      detail: normalized,
    }),
  );
}
