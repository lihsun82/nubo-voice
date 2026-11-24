import { NuboAudioPrimeGuard } from "@/components/NuboAudioPrimeGuard";
import { NuboMultilingualRuntime } from "@/components/NuboMultilingualRuntime";
import { NuboSmartNoiseRuntime } from "@/components/NuboSmartNoiseRuntime";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { NuboGuestMusicSlot } from "@/components/NuboGuestMusicSlot";
import { NuboGuestConfigRuntime } from "@/components/NuboGuestConfigRuntime";
import { NuboNearbyResults } from "@/components/NuboNearbyResults";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="shell nubo-guest-shell nubo-concierge-shell">
      <NuboGuestConfigRuntime />
      <NuboSmartNoiseRuntime />
      <NuboAudioPrimeGuard />
      <NuboMultilingualRuntime />
      <NuboGuestMusicSlot />
      <NuboVoiceConsole />
      <NuboNearbyResults />
    </main>
  );
}
