import { IntegrationCenter } from "@/components/IntegrationCenter";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { TaskCenter } from "@/components/TaskCenter";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">PERSONAL AI OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">560px紫藍能量核心、920粒子、LINE與音量語音控制</p>
      </section>
      <NuboVoiceConsole />
      <IntegrationCenter />
      <TaskCenter />
      <footer>
        <span>v0.5.1 Mobile Fallback Fix branch mobile-pwa-integration-20260713 2026-08-01 17:12</span>
        <span>手機開頁含強制備援按鈕；音量限制0–100</span>
      </footer>
    </main>
  );
}
