"use client";

import { useEffect, useState } from "react";
import { NuboInlineMusicPlayer } from "@/components/NuboInlineMusicPlayer";
import { NuboMusicSoundEnhancer } from "@/components/NuboMusicSoundEnhancer";
import { getNuboGuestConfigSnapshot } from "@/lib/nubo-guest-features";

export function NuboGuestMusicSlot() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const sync = () => setEnabled(getNuboGuestConfigSnapshot().musicEnabled);
    window.addEventListener("nubo:guest-config", sync);
    sync();
    return () => window.removeEventListener("nubo:guest-config", sync);
  }, []);

  return enabled ? (
    <>
      <NuboMusicSoundEnhancer />
      <NuboInlineMusicPlayer />
    </>
  ) : null;
}
