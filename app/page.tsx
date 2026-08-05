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
          AINUBO Hotel 智慧旅館管家｜青春、輕亮、自然的 Shimmer 女聲
        </p>
      </section>
      <DeferredDashboardCenters />
      <footer>
        <span>v0.5.1 NUBO V15.6.10｜LEO LLM 青春自然 Shimmer 版</span>
        <span>Shimmer 固定聲線｜語速 0.98｜約 18–21 歲感｜自然台灣華語｜管家身份不變</span>
      </footer>
    </main>
  );
}
