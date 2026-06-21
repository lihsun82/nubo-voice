import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">PERSONAL AI OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">你的即時語音總管</p>
      </section>
      <NuboVoiceConsole />
      <footer>
        <span>v0.1 語音核心</span>
        <span>高風險操作預設禁止自動執行</span>
      </footer>
    </main>
  );
}
