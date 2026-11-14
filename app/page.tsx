import { NuboAudioPrimeGuard } from "@/components/NuboAudioPrimeGuard";
import { NuboMultilingualRuntime } from "@/components/NuboMultilingualRuntime";
import { NuboInlineMusicPlayer } from "@/components/NuboInlineMusicPlayer";
import { NuboMusicSoundEnhancer } from "@/components/NuboMusicSoundEnhancer";
import { NuboSmartNoiseRuntime } from "@/components/NuboSmartNoiseRuntime";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { NUBO_GUEST_MUSIC_ENABLED } from "@/lib/nubo-guest-features";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="shell nubo-guest-shell">
      <NuboSmartNoiseRuntime />
      <NuboAudioPrimeGuard />
      <NuboMultilingualRuntime />
      {NUBO_GUEST_MUSIC_ENABLED ? (
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
