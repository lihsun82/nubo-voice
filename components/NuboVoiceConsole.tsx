"use client";

import { useEffect, useRef, useState } from "react";
import { GeminiVoiceConsole } from "@/components/GeminiVoiceConsole";
import { OpenAIRealtimeVoiceConsoleFixed } from "@/components/OpenAIRealtimeVoiceConsoleFixed";
import { NuboVoiceProfileRuntime } from "@/components/NuboVoiceProfileRuntime";
import {
  NUBO_DEFAULT_VOICE_PROFILE,
  NUBO_VOICE_PROFILE_EVENT,
  NUBO_VOICE_PROFILE_STORAGE_KEY,
  readNuboVoiceProfile,
  type NuboVoiceProfile,
} from "@/lib/nubo-voice-profile";
import type { NuboVoicePhase } from "@/lib/nubo-voice-phase";

const EXTERNAL_RETURN_KEY = "nubo_external_app_return_v1";
const VOICE_RELOAD_KEY = "nubo_voice_profile_reload_v15_6_1";

function dispatchVoiceLevel(level: number) {
  window.dispatchEvent(
    new CustomEvent("nubo:voice-level", { detail: { level } }),
  );
}

function getNuboVoiceAudioOutputs() {
  return Array.from(
    document.querySelectorAll<HTMLAudioElement>(
      'audio[data-nubo-voice-output="true"]',
    ),
  );
}

function dedupeNuboVoiceAudioOutputs() {
  const outputs = getNuboVoiceAudioOutputs();
  if (outputs.length <= 1) return;

  // Keep only the newest Realtime voice output. Any older audio element belongs
  // to a stale peer connection and can cause the same reply to overlap twice.
  const keep = outputs[outputs.length - 1];
  for (const audio of outputs) {
    if (audio === keep) continue;
    audio.pause();
    audio.srcObject = null;
    audio.remove();
  }
}

function stopBrowserVoiceOutput() {
  window.speechSynthesis?.cancel();
  dispatchVoiceLevel(0);

  document.querySelectorAll<HTMLAudioElement>("audio").forEach((audio) => {
    audio.pause();
    if (audio.dataset.nuboVoiceOutput === "true") {
      audio.srcObject = null;
      audio.remove();
    }
  });
}

export function NuboVoiceConsole() {
  const [profile, setProfile] = useState<NuboVoiceProfile>(
    NUBO_DEFAULT_VOICE_PROFILE,
  );
  const mountedRef = useRef(false);

  useEffect(() => {
    setProfile(readNuboVoiceProfile());
    mountedRef.current = true;

    const reloadVoiceCore = () => {
      if (!mountedRef.current) return;
      stopBrowserVoiceOutput();
      window.sessionStorage.setItem(VOICE_RELOAD_KEY, "true");
      window.location.reload();
    };

    const handleProfileChange = () => {
      reloadVoiceCore();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === NUBO_VOICE_PROFILE_STORAGE_KEY) {
        reloadVoiceCore();
      }
    };

    window.addEventListener(NUBO_VOICE_PROFILE_EVENT, handleProfileChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      mountedRef.current = false;
      stopBrowserVoiceOutput();
      window.removeEventListener(NUBO_VOICE_PROFILE_EVENT, handleProfileChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const keepHealthySession = () => {
      if (document.visibilityState === "visible") {
        window.localStorage.removeItem(EXTERNAL_RETURN_KEY);
        dedupeNuboVoiceAudioOutputs();
      }
    };

    const stopOnPageExit = () => {
      stopBrowserVoiceOutput();
    };

    const handleVoicePhase = (event: Event) => {
      const phase = (event as CustomEvent<{ phase?: NuboVoicePhase }>).detail
        ?.phase;
      if (phase === "speaking") {
        // Browser TTS is never allowed to speak over the active cloud voice.
        window.speechSynthesis?.cancel();
        dedupeNuboVoiceAudioOutputs();
      }
    };

    const audioObserver = new MutationObserver(() => {
      dedupeNuboVoiceAudioOutputs();
    });
    audioObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    document.addEventListener("visibilitychange", keepHealthySession, true);
    window.addEventListener("focus", keepHealthySession, true);
    window.addEventListener("pageshow", keepHealthySession, true);
    window.addEventListener("pagehide", stopOnPageExit, true);
    window.addEventListener("beforeunload", stopOnPageExit, true);
    window.addEventListener("nubo-voice-phase", handleVoicePhase);

    keepHealthySession();

    return () => {
      audioObserver.disconnect();
      document.removeEventListener("visibilitychange", keepHealthySession, true);
      window.removeEventListener("focus", keepHealthySession, true);
      window.removeEventListener("pageshow", keepHealthySession, true);
      window.removeEventListener("pagehide", stopOnPageExit, true);
      window.removeEventListener("beforeunload", stopOnPageExit, true);
      window.removeEventListener("nubo-voice-phase", handleVoicePhase);
    };
  }, []);

  const profileKey = `${profile.engine}:${profile.voice}:${profile.personality}`;

  return (
    <>
      <NuboVoiceProfileRuntime />
      {profile.engine === "openai" ? (
        <OpenAIRealtimeVoiceConsoleFixed key={profileKey} profile={profile} />
      ) : (
        <GeminiVoiceConsole key={profileKey} />
      )}
    </>
  );
}
