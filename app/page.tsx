import { DeferredDashboardCenters } from "@/components/DeferredDashboardCenters";
import { NuboAudioPrimeGuard } from "@/components/NuboAudioPrimeGuard";
import { NuboHumanConcierge } from "@/components/NuboHumanConcierge";
import { NuboInlineMusicPlayer } from "@/components/NuboInlineMusicPlayer";
import { NuboMusicSoundEnhancer } from "@/components/NuboMusicSoundEnhancer";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";

export default function HomePage() {
  return (
    <main className="shell">
      <NuboAudioPrimeGuard />
      <NuboHumanConcierge />
      <NuboVoiceConsole />
      <NuboInlineMusicPlayer />
      <NuboMusicSoundEnhancer />
      <section className="hero">
        <div className="eyebrow">NUBO HUMAN CONCIERGE SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">真人智慧禮賓、即時語音與自動化工作中心</p>
      </section>
      <DeferredDashboardCenters />
      <footer>
        <span>v0.5.1 Tavus Real Avatar V16.3 2026-08-03</span>
        <span>WebRTC 真人數位人、原生表情與嘴型同步串流</span>
      </footer>
    </main>
  );
}
