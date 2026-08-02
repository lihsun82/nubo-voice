import { DeferredDashboardCenters } from "@/components/DeferredDashboardCenters";
import { NuboAudioPrimeGuard } from "@/components/NuboAudioPrimeGuard";
import { NuboGeminiVoiceProfileProbe } from "@/components/NuboGeminiVoiceProfileProbe";
import { NuboInlineMusicPlayer } from "@/components/NuboInlineMusicPlayer";
import { NuboMusicSoundEnhancer } from "@/components/NuboMusicSoundEnhancer";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";

export default function HomePage() {
  return (
    <main className="shell">
      <NuboAudioPrimeGuard />
      <NuboGeminiVoiceProfileProbe />
      <NuboVoiceConsole />
      <NuboInlineMusicPlayer />
      <NuboMusicSoundEnhancer />
      <section className="hero">
        <div className="eyebrow">NUBO INTELLIGENT OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">智慧語音、行動控制與自動化工作中心</p>
      </section>
      <DeferredDashboardCenters />
      <footer>
        <span>v0.5.1 High Fidelity Music V14.6 2026-08-02</span>
        <span>優先官方高品質音源；播放器使用品質安全視窗與強化音量曲線</span>
      </footer>
    </main>
  );
}
