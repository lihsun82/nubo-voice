import { DeferredDashboardCenters } from "@/components/DeferredDashboardCenters";
import { NuboAudioPrimeGuard } from "@/components/NuboAudioPrimeGuard";
import { NuboInlineMusicPlayer } from "@/components/NuboInlineMusicPlayer";
import { NuboLanguageModeSelector } from "@/components/NuboLanguageModeSelector";
import { NuboMusicSoundEnhancer } from "@/components/NuboMusicSoundEnhancer";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { NuboVoiceQuickSelector } from "@/components/NuboVoiceQuickSelector";
import { NuboVoiceTuningPanel } from "@/components/NuboVoiceTuningPanel";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="shell">
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
          AINUBO Hotel 智慧旅館管家｜YouTube 按鈕根節點自動觸發・Android App Link 優先・360° DNA 分子球
        </p>
      </section>
      <DeferredDashboardCenters />
      <footer>
        <span>NUBO V15.6.39｜YouTube 自動點擊偵測修正版</span>
        <span>修正 MutationObserver 漏掉新增按鈕本身・「開啟：YouTube」出現即自動觸發</span>
      </footer>
    </main>
  );
}
