import { IntegrationCenter } from "@/components/IntegrationCenter";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { TaskCenter } from "@/components/TaskCenter";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">PERSONAL AI OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">720粒子主科技球、研究、郵件與桌面工具</p>
      </section>
      <NuboVoiceConsole />
      <IntegrationCenter />
      <TaskCenter />
      <footer>
        <span>v0.8 Web Tab</span>
        <span>網站會在新的瀏覽器分頁開啟</span>
      </footer>
    </main>
  );
}
