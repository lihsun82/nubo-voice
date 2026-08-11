import { DeferredDashboardCenters } from "@/components/DeferredDashboardCenters";
import { NuboAudioPrimeGuard } from "@/components/NuboAudioPrimeGuard";
import { NuboInlineMusicPlayer } from "@/components/NuboInlineMusicPlayer";
import { NuboLanguageModeSelector } from "@/components/NuboLanguageModeSelector";
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
      <NuboLanguageModeSelector />
      <NuboVoiceQuickSelector />
      <NuboVoiceTuningPanel />
      <NuboInlineMusicPlayer />
      <NuboMusicSoundEnhancer />
      <section className="hero">
        <div className="eyebrow">AINUBO HOTEL INTELLIGENT CONCIERGE</div>
        <h1>NUBO</h1>
        <p className="subtitle">
          AINUBO Hotel 智慧旅館管家｜低延遲回覆・智慧降噪・背景停止雲端收音・60秒智慧節約待命
        </p>
      </section>
      <DeferredDashboardCenters />
      <footer>
        <span>NUBO V21｜低延遲診斷＋真人擬真語音版</span>
        <span>Server VAD 400ms・WebRTC 延遲診斷・疊音防護・Pixel 熱管理・固定簽章同步</span>
      </footer>
    </main>
  );
}
