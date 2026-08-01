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
      <section className="hero">
        <div className="eyebrow">NUBO INTELLIGENT OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">智慧語音、行動控制與自動化工作中心</p>
      </section>
      <NuboVoiceStudio />
      <NuboVoiceConsole />
      <NuboLatencyPanel />
      <NuboLiveLatencyPanel />
      <DeferredDashboardCenters />
      <footer>
        <span>v0.5.1 Mobile Direct App V4 2026-08-02</span>
        <span>手機直接開啟App；未安裝時自動降級官方網頁</span>
      </footer>
    </main>
  );
}
