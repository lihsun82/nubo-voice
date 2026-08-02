"use client";

import { useEffect, useState } from "react";
import { GeminiVoiceConsole } from "@/components/GeminiVoiceConsole";
import { OpenAIRealtimeVoiceConsole } from "@/components/OpenAIRealtimeVoiceConsole";
import { NuboVoiceProfileRuntime } from "@/components/NuboVoiceProfileRuntime";
import {
  NUBO_DEFAULT_VOICE_PROFILE,
  NUBO_VOICE_PROFILE_EVENT,
  NUBO_VOICE_PROFILE_STORAGE_KEY,
  normalizeNuboVoiceProfile,
  readNuboVoiceProfile,
  type NuboVoiceProfile,
} from "@/lib/nubo-voice-profile";

const EXTERNAL_RETURN_KEY = "nubo_external_app_return_v1";

export function NuboVoiceConsole() {
  const [profile, setProfile] = useState<NuboVoiceProfile>(
    NUBO_DEFAULT_VOICE_PROFILE,
  );

  useEffect(() => {
    setProfile(readNuboVoiceProfile());

    const handleProfileChange = (event: Event) => {
      const customEvent = event as CustomEvent<NuboVoiceProfile>;
      setProfile(normalizeNuboVoiceProfile(customEvent.detail));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === NUBO_VOICE_PROFILE_STORAGE_KEY) {
        setProfile(readNuboVoiceProfile());
      }
    };

    window.addEventListener(NUBO_VOICE_PROFILE_EVENT, handleProfileChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(NUBO_VOICE_PROFILE_EVENT, handleProfileChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const keepHealthySession = () => {
      if (document.visibilityState === "visible") {
        window.localStorage.removeItem(EXTERNAL_RETURN_KEY);
      }
    };

    document.addEventListener("visibilitychange", keepHealthySession, true);
    window.addEventListener("focus", keepHealthySession, true);
    window.addEventListener("pageshow", keepHealthySession, true);

    keepHealthySession();

    return () => {
      document.removeEventListener("visibilitychange", keepHealthySession, true);
      window.removeEventListener("focus", keepHealthySession, true);
      window.removeEventListener("pageshow", keepHealthySession, true);
    };
  }, []);

  const profileKey = `${profile.engine}:${profile.voice}:${profile.personality}`;

  return (
    <>
      <NuboVoiceProfileRuntime />
      {profile.engine === "openai" ? (
        <OpenAIRealtimeVoiceConsole key={profileKey} profile={profile} />
      ) : (
        <GeminiVoiceConsole key={profileKey} />
      )}
    </>
  );
}
