"use client";

import { useEffect } from "react";
import {
  getNuboGuestConfigSnapshot,
  setNuboGuestConfigSnapshot,
  type NuboGuestRuntimeConfig,
} from "@/lib/nubo-guest-features";
import { NUBO_VOICE_PROFILE_STORAGE_KEY } from "@/lib/nubo-voice-profile";
import { NUBO_VOICE_TUNING_STORAGE_KEY } from "@/lib/nubo-voice-tuning";

const SEEN_KEY = "nubo_guest_config_seen_v1";
const PROFILE_BACKUP_KEY = "nubo_guest_original_voice_profile_v1";
const TUNING_BACKUP_KEY = "nubo_guest_original_voice_tuning_v1";
const EMPTY = "__empty__";

function applyLocalOverride(key: string, backupKey: string, value: unknown | null) {
  const backup = window.localStorage.getItem(backupKey);
  if (value === null) {
    if (backup !== null) {
      if (backup === EMPTY) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, backup);
      window.localStorage.removeItem(backupKey);
    }
    return;
  }
  if (backup === null) {
    window.localStorage.setItem(backupKey, window.localStorage.getItem(key) ?? EMPTY);
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

function syncGuestConfig(value: NuboGuestRuntimeConfig) {
  setNuboGuestConfigSnapshot(value);
  window.dispatchEvent(new Event("nubo:guest-config"));
  const revision = String(value.revision);
  if (window.sessionStorage.getItem(SEEN_KEY) === revision) return;
  window.sessionStorage.setItem(SEEN_KEY, revision);
  applyLocalOverride(NUBO_VOICE_PROFILE_STORAGE_KEY, PROFILE_BACKUP_KEY, value.voiceProfile);
  applyLocalOverride(NUBO_VOICE_TUNING_STORAGE_KEY, TUNING_BACKUP_KEY, value.voiceTuning);
  // A fresh voice session must receive new speech tools and voice parameters.
  window.location.reload();
}

export function NuboGuestConfigRuntime() {
  useEffect(() => {
    let disposed = false;
    let busy = false;
    let retryAfter = 0;

    const poll = async () => {
      if (disposed || busy || document.visibilityState !== "visible" || Date.now() < retryAfter) return;
      busy = true;
      try {
        const response = await fetch("/api/guest-config", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (response.status === 401 || response.status === 403) {
          // Unpaired guest tablets do not need to retry every two seconds.
          retryAfter = Date.now() + 30_000;
          return;
        }
        if (!response.ok) {
          retryAfter = Date.now() + 10_000;
          return;
        }
        retryAfter = 0;
        const config = await response.json() as NuboGuestRuntimeConfig;
        if (!disposed && Number.isFinite(config.revision) &&
            config.revision !== getNuboGuestConfigSnapshot().revision) {
          syncGuestConfig(config);
        }
      } catch {
        // Keep the last working settings if the network is briefly unavailable.
        retryAfter = Date.now() + 10_000;
      } finally {
        busy = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    const onVisible = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
