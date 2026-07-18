import { DeferredDashboardCenters } from "@/components/DeferredDashboardCenters";
import { NuboCompactSection } from "@/components/NuboCompactSection";
import { NuboGeminiVoiceProfileProbe } from "@/components/NuboGeminiVoiceProfileProbe";
import { NuboLatencyPanel } from "@/components/NuboLatencyPanel";
import { NuboLiveLatencyPanel } from "@/components/NuboLiveLatencyPanel";
import { NuboLiveLatencyProbe } from "@/components/NuboLiveLatencyProbe";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { NuboVoiceStudio } from "@/components/NuboVoiceStudio";
import styles from "@/app/page.module.css";

export default function HomePage() {
  return (
    <main className={`shell ${styles.shell}`}>
      <NuboLiveLatencyProbe />
      <NuboGeminiVoiceProfileProbe />

      <section className={`hero ${styles.hero}`}>
        <div className="eyebrow">NUBO INTELLIGENT OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">智慧語音、行動控制與自動化工作中心</p>
      </section>

      <NuboVoiceConsole />

      <div className={styles.stack}>
        <NuboCompactSection
          id="voice-studio"
          title="語音設定"
          subtitle="Gemini Live 聲線與個性"
        >
          <NuboVoiceStudio />
        </NuboCompactSection>

        <NuboCompactSection
          id="diagnostics"
          title="系統診斷"
          subtitle="網路、Gemini Live 與延遲數據"
        >
          <NuboLatencyPanel />
          <NuboLiveLatencyPanel />
        </NuboCompactSection>

        <NuboCompactSection
          id="work-centers"
          title="工作中心"
          subtitle="代理人、整合與任務管理"
        >
          <DeferredDashboardCenters />
        </NuboCompactSection>
      </div>

      <footer>
        <span>v0.5.1 System Control</span>
        <span>Gemini Live 語音優先模式</span>
      </footer>
    </main>
  );
}
