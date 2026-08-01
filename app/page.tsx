import { DeferredDashboardCenters } from "@/components/DeferredDashboardCenters";
import { NuboGeminiVoiceProfileProbe } from "@/components/NuboGeminiVoiceProfileProbe";
import { NuboLatencyPanel } from "@/components/NuboLatencyPanel";
import { NuboLiveLatencyPanel } from "@/components/NuboLiveLatencyPanel";
import { NuboLiveLatencyProbe } from "@/components/NuboLiveLatencyProbe";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { NuboVoiceStudio } from "@/components/NuboVoiceStudio";

export default function HomePage() {
  return (
    <main className="shell">
      <NuboLiveLatencyProbe />
      <NuboGeminiVoiceProfileProbe />
      <NuboVoiceConsole />
      <section className="hero">
        <div className="eyebrow">NUBO INTELLIGENT OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">智慧語音、行動控制與自動化工作中心</p>
      </section>
      <NuboVoiceStudio />
      <NuboLatencyPanel />
      <NuboLiveLatencyPanel />
      <DeferredDashboardCenters />
      <footer>
        <span>v0.5.1 Mobile Web Plan B V9 2026-08-02</span>
        <span>科技球體置頂；網頁直接呼叫外部App，Android系統提示依裝置政策顯示</span>
      </footer>
    </main>
  );
}
