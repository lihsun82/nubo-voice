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
          AINUBO Hotel 智慧旅館管家｜更年輕、柔和、自然的 Coral 女聲
        </p>
      </section>
      <DeferredDashboardCenters />
      <footer>
        <span>v0.5.1 NUBO V15.6.9｜LEO LLM 年輕自然 Coral 版</span>
        <span>Coral 固定聲線｜語速 0.92｜約 24–27 歲｜自然台灣華語｜管家身份不變</span>
      </footer>
    </main>
  );
}
