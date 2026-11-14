// Guest defaults stay safe until a paired tablet receives owner settings.
export const NUBO_GUEST_MUSIC_ENABLED = false;

export type NuboGuestRuntimeConfig = {
  revision: number;
  musicEnabled: boolean;
  idleSeconds: number;
  wakeWords: string[];
  voiceProfile: { engine: "gemini" | "openai"; voice: string; personality: string } | null;
  voiceTuning: Record<string, number> | null;
};

let snapshot: NuboGuestRuntimeConfig = {
  revision: 1,
  musicEnabled: NUBO_GUEST_MUSIC_ENABLED,
  idleSeconds: 30,
  wakeWords: ["嗨nubo", "嗨 nubo", "ha nubo", "nubo", "兄弟", "有人嗎"],
  voiceProfile: null,
  voiceTuning: null,
};

export function getNuboGuestConfigSnapshot() {
  return snapshot;
}

export function setNuboGuestConfigSnapshot(value: NuboGuestRuntimeConfig) {
  snapshot = value;
}
