import { IntegrationCenter } from "@/components/IntegrationCenter";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { TaskCenter } from "@/components/TaskCenter";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">PERSONAL AI OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">語音、研究、Gmail、YouTube與排程工作流</p>
      </section>
      <NuboVoiceConsole />
      <IntegrationCenter />
      <TaskCenter />
      <footer>
        <span>v0.4 Actions與自動化</span>
        <span>寄信採確認與白名單；付款、刪除、改價仍禁止自動執行</span>
      </footer>
    </main>
  );
}
