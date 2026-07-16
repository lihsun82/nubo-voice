import { AgentWorkCenter } from "@/components/AgentWorkCenter";
import { IntegrationCenter } from "@/components/IntegrationCenter";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { TaskCenter } from "@/components/TaskCenter";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">NUBO INTELLIGENT OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">智慧語音、行動控制與自動化工作中心</p>
      </section>
      <NuboVoiceConsole />
      <AgentWorkCenter />
      <IntegrationCenter />
      <TaskCenter />
      <footer>
        <span>v0.5.1 System Control</span>
        <span>應用程式採固定白名單；音量限制0–100</span>
      </footer>
    </main>
  );
}
