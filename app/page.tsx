import { DeferredDashboardCenters } from "@/components/DeferredDashboardCenters";
import { NuboGeminiVoiceProfileProbe } from "@/components/NuboGeminiVoiceProfileProbe";
import { NuboInlineMusicPlayer } from "@/components/NuboInlineMusicPlayer";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";

export default function HomePage() {
  return (
    <main className="shell">
      <NuboGeminiVoiceProfileProbe />
      <NuboVoiceConsole />
      <NuboInlineMusicPlayer />
      <section className="hero">
        <div className="eyebrow">NUBO INTELLIGENT OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">智慧語音、行動控制與自動化工作中心</p>
      </section>
      <DeferredDashboardCenters />
      <footer>
        <span>v0.5.1 Background Music V14.2 2026-08-02</span>
        <span>開啟外部網頁時維持NUBO音樂播放；返回後自動續播</span>
      </footer>
    </main>
  );
}
