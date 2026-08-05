import { DeferredDashboardCenters } from "@/components/DeferredDashboardCenters";
import { NuboAudioPrimeGuard } from "@/components/NuboAudioPrimeGuard";
import { NuboInlineMusicPlayer } from "@/components/NuboInlineMusicPlayer";
import { NuboMusicSoundEnhancer } from "@/components/NuboMusicSoundEnhancer";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { NuboVoiceQuickSelector } from "@/components/NuboVoiceQuickSelector";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="shell">
      <NuboAudioPrimeGuard />
      <NuboVoiceConsole />
      <NuboVoiceQuickSelector />
      <NuboInlineMusicPlayer />
      <NuboMusicSoundEnhancer />
      <section className="hero">
        <div className="eyebrow">AINUBO HOTEL INTELLIGENT CONCIERGE</div>
        <h1>NUBO</h1>
        <p className="subtitle">
          AINUBO Hotel 智慧旅館管家｜年輕聲線即時比較・自然台灣華語
        </p>
      </section>
      <DeferredDashboardCenters />
      <footer>
        <span>v0.5.1 NUBO V15.6.11｜LEO LLM 年輕聲線試聽版</span>
        <span>Shimmer・Verse・Alloy・Coral｜語速 1.0｜切換時重建 Realtime｜管家身份不變</span>
      </footer>
    </main>
  );
}
