import { DeferredDashboardCenters } from "@/components/DeferredDashboardCenters";
import { NuboCompactSection } from "@/components/NuboCompactSection";
import { NuboGeminiVoiceProfileProbe } from "@/components/NuboGeminiVoiceProfileProbe";
import { NuboLatencyPanel } from "@/components/NuboLatencyPanel";
import { NuboLiveLatencyPanel } from "@/components/NuboLiveLatencyPanel";
import { NuboLiveLatencyProbe } from "@/components/NuboLiveLatencyProbe";
import { NuboSingleFingerScroll } from "@/components/NuboSingleFingerScroll";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { NuboVoiceStudio } from "@/components/NuboVoiceStudio";
import styles from "@/app/page.module.css";

export default function HomePage() {
  return (
    <main className={`shell ${styles.shell}`}>
      <NuboSingleFingerScroll />
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
          subtitle="NUBO 聲線與個性"
        >
          <NuboVoiceStudio />
        </NuboCompactSection>

        <NuboCompactSection
          id="diagnostics"
          title="系統診斷"
          subtitle="網路、即時語音與延遲數據"
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
        <span>Mobile Web Open V16</span>
        <span>手機語音直接開啟 FB、IG、YouTube</span>
      </footer>
    </main>
  );
}
