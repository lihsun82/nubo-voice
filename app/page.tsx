import { NuboAudioPrimeGuard } from "@/components/NuboAudioPrimeGuard";
import { NuboMultilingualRuntime } from "@/components/NuboMultilingualRuntime";
import { NuboInlineMusicPlayer } from "@/components/NuboInlineMusicPlayer";
import { NuboMusicSoundEnhancer } from "@/components/NuboMusicSoundEnhancer";
import { NuboSmartNoiseRuntime } from "@/components/NuboSmartNoiseRuntime";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { readGuestConfig } from "@/lib/nubo-guest-config-server";
import { NuboGuestConfigRuntime } from "@/components/NuboGuestConfigRuntime";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = await readGuestConfig();
  return (
    <main className="shell nubo-guest-shell">
      <NuboGuestConfigRuntime />
      <NuboSmartNoiseRuntime />
      <NuboAudioPrimeGuard />
      <NuboMultilingualRuntime />
      {config.musicEnabled ? (
        <>
          <NuboMusicSoundEnhancer />
          <NuboInlineMusicPlayer />
        </>
      ) : null}
      <header className="nubo-guest-header">
        <h1>AINUBO 新寶智慧酒店</h1>
        <p>您好，請點「開始對話」，直接說出您的需求。</p>
      </header>
      <NuboVoiceConsole />
    </main>
  );
}
