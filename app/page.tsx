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
        <span>v0.5.1 External Web Tab V14 2026-08-02</span>
        <span>IG、FB、地圖與一般網站使用外部分頁；NUBO主頁持續保留</span>
      </footer>
    </main>
  );
}
