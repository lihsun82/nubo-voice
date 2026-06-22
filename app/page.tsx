import { IntegrationCenter } from "@/components/IntegrationCenter";
import { NuboMediaDock } from "@/components/NuboMediaDock";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { TaskCenter } from "@/components/TaskCenter";

export default function HomePage() {
  return (
    <>
      <main className="shell">
        <section className="hero">
          <div className="eyebrow">PERSONAL AI OPERATING SYSTEM</div>
          <h1>NUBO</h1>
          <p className="subtitle">720粒子主科技球、研究、郵件、音樂與桌面工具</p>
        </section>
        <NuboVoiceConsole />
        <IntegrationCenter />
        <TaskCenter />
        <footer>
          <span>v0.7 Single Window</span>
          <span>網站在目前分頁開啟；YouTube留在NUBO主頁播放</span>
        </footer>
      </main>
      <NuboMediaDock />
    </>
  );
}
