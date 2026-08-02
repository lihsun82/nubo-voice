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
        <span>v0.5.1 Inline Music Replace V13 2026-08-02</span>
        <span>指定歌曲留在NUBO頁面播放；新歌曲自動替換目前歌曲</span>
      </footer>
    </main>
  );
}
