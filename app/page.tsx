import { IntegrationCenter } from "@/components/IntegrationCenter";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { TaskCenter } from "@/components/TaskCenter";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">PERSONAL AI OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">Voice, research, Gmail, YouTube and Windows tools</p>
      </section>
      <NuboVoiceConsole />
      <IntegrationCenter />
      <TaskCenter />
      <footer>
        <span>v0.5 Desktop Actions</span>
        <span>Website and desktop actions use a safe allowlist</span>
      </footer>
    </main>
  );
}
