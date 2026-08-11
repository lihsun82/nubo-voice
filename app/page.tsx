import { DeferredDashboardCenters } from "@/components/DeferredDashboardCenters";
import { NuboAudioPrimeGuard } from "@/components/NuboAudioPrimeGuard";
import { NuboInlineMusicPlayer } from "@/components/NuboInlineMusicPlayer";
import { NuboLanguageModeSelector } from "@/components/NuboLanguageModeSelector";
import { NuboMultilingualRuntime } from "@/components/NuboMultilingualRuntime";
import { NuboMusicSoundEnhancer } from "@/components/NuboMusicSoundEnhancer";
import { NuboSmartNoiseRuntime } from "@/components/NuboSmartNoiseRuntime";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { NuboVoiceQuickSelector } from "@/components/NuboVoiceQuickSelector";
import { NuboVoiceTuningPanel } from "@/components/NuboVoiceTuningPanel";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="shell">
      <NuboSmartNoiseRuntime />
      <NuboAudioPrimeGuard />
      <NuboVoiceConsole />
      <NuboMultilingualRuntime />
      <NuboLanguageModeSelector />
      <NuboVoiceQuickSelector />
      <NuboVoiceTuningPanel />
      <NuboInlineMusicPlayer />
      <NuboMusicSoundEnhancer />
      <section className="hero">
        <div className="eyebrow">AINUBO HOTEL INTELLIGENT CONCIERGE</div>
        <h1>NUBO</h1>
        <p className="subtitle">
          AINUBO Hotel 智慧旅館管家｜母語級國語・快速多語切換・低延遲回覆・智慧降噪・背景停止雲端收音
        </p>
      </section>
      <DeferredDashboardCenters />
      <footer>
        <span>NUBO V22｜母語級國語＋快速多語切換版</span>
        <span>臺灣標準國語 Accent Lock・阿拉伯語／芬蘭語即時切換・Server VAD 400ms・延遲診斷・Pixel 熱管理</span>
      </footer>
    </main>
  );
}
