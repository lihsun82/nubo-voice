import { IntegrationCenter } from "@/components/IntegrationCenter";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { TaskCenter } from "@/components/TaskCenter";

const NUBO_RELEASE = "V15.6.24";
const NUBO_BUILD = "youtube-deploy-verification-20260806";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">PERSONAL AI OPERATING SYSTEM</div>
        <h1>NUBO</h1>
        <p className="subtitle">560px紫藍能量核心、920粒子、LINE與音量語音控制</p>
        <p data-nubo-release style={{ marginTop: 8, fontSize: 13, opacity: 0.72 }}>
          {NUBO_RELEASE} · {NUBO_BUILD}
        </p>
      </section>
      <NuboVoiceConsole />
      <IntegrationCenter />
      <TaskCenter />
      <footer>
        <span>{NUBO_RELEASE} · branch feat/mobile-agent-omniroute-v6</span>
        <span>YouTube 外開修正與部署驗證</span>
      </footer>
    </main>
  );
}
