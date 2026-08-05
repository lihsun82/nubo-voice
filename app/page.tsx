import { DeferredDashboardCenters } from "@/components/DeferredDashboardCenters";
import { NuboAudioPrimeGuard } from "@/components/NuboAudioPrimeGuard";
import { NuboInlineMusicPlayer } from "@/components/NuboInlineMusicPlayer";
import { NuboMusicSoundEnhancer } from "@/components/NuboMusicSoundEnhancer";
import { NuboVoiceAudioTuningRuntime } from "@/components/NuboVoiceAudioTuningRuntime";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { NuboVoiceQuickSelector } from "@/components/NuboVoiceQuickSelector";
import { NuboVoiceTuningPanel } from "@/components/NuboVoiceTuningPanel";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="shell">
      <NuboAudioPrimeGuard />
      <NuboVoiceAudioTuningRuntime />
      <NuboVoiceConsole />
      <NuboVoiceQuickSelector />
      <NuboVoiceTuningPanel />
      <NuboInlineMusicPlayer />
      <NuboMusicSoundEnhancer />
      <section className="hero">
        <div className="eyebrow">AINUBO HOTEL INTELLIGENT CONCIERGE</div>
        <h1>NUBO</h1>
        <p className="subtitle">
          AINUBO Hotel 智慧旅館管家｜可調式聲線工作台・自然台灣華語
        </p>
      </section>
      <DeferredDashboardCenters />
      <footer>
        <span>v0.5.1 NUBO V15.6.12｜LEO LLM 聲線調音工作台</span>
        <span>10 種聲線｜語速・明亮度・溫暖度・清晰度・壓縮・音量｜管家身份不變</span>
      </footer>
    </main>
  );
}
