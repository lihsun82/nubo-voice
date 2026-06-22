import { IntegrationCenter } from "@/components/IntegrationCenter";
import { NuboMediaDock } from "@/components/NuboMediaDock";
import { NuboTechBackground } from "@/components/NuboTechBackground";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { TaskCenter } from "@/components/TaskCenter";

export default function HomePage() {
  return (
    <>
      <NuboTechBackground />
      <main className="shell">
        <section className="hero">
          <div className="eyebrow">PERSONAL AI OPERATING SYSTEM</div>
          <h1>NUBO</h1>
          <p className="subtitle">高科技動態語音助理、研究、郵件、音樂與桌面工具</p>
        </section>
        <NuboVoiceConsole />
        <IntegrationCenter />
        <TaskCenter />
        <footer>
          <span>v0.6 Browser Bridge</span>
          <span>音樂在NUBO頁面播放；網站使用預先取得權限的專用視窗</span>
        </footer>
      </main>
      <NuboMediaDock />
    </>
  );
}
