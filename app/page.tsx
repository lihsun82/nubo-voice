import { NuboAudioPrimeGuard } from "@/components/NuboAudioPrimeGuard";
import { NuboMultilingualRuntime } from "@/components/NuboMultilingualRuntime";
import { NuboSmartNoiseRuntime } from "@/components/NuboSmartNoiseRuntime";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { NuboGuestMusicSlot } from "@/components/NuboGuestMusicSlot";
import { NuboGuestConfigRuntime } from "@/components/NuboGuestConfigRuntime";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="shell nubo-guest-shell">
      <NuboGuestConfigRuntime />
      <NuboSmartNoiseRuntime />
      <NuboAudioPrimeGuard />
      <NuboMultilingualRuntime />
      <NuboGuestMusicSlot />
      <header className="nubo-guest-header">
        <h1>AINUBO 新寶智慧酒店</h1>
        <p>您好，請點「開始對話」，直接說出您的需求。</p>
      </header>
      <NuboVoiceConsole />
    </main>
  );
}
