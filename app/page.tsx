import { DeferredDashboardCenters } from "@/components/DeferredDashboardCenters";
import { NuboGeminiVoiceProfileProbe } from "@/components/NuboGeminiVoiceProfileProbe";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";

export default function HomePage() {
  return (
    <main className="shell">
      <NuboGeminiVoiceProfileProbe />
      <NuboVoiceConsole />
      <section className="hero">
        <div className="eyebrow">NUBO INTELLIGENT OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">智慧語音、行動控制與自動化工作中心</p>
      </section>
      <DeferredDashboardCenters />
      <footer>
        <span>v0.5.1 Mobile Direct Open V12 2026-08-02</span>
        <span>網頁與外部目標收到指令後直接開啟，不顯示NUBO確認按鈕</span>
      </footer>
    </main>
  );
}
