import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { TaskCenter } from "@/components/TaskCenter";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">PERSONAL AI OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">語音理解、工作執行、定時追蹤與成果回報</p>
      </section>
      <NuboVoiceConsole />
      <TaskCenter />
      <footer>
        <span>v0.2 任務中心</span>
        <span>外部寄送、刪除、付款與改價仍需再次確認</span>
      </footer>
    </main>
  );
}
