import Link from "next/link";
import { DeferredDashboardCenters } from "@/components/DeferredDashboardCenters";
import { NuboAudioPrimeGuard } from "@/components/NuboAudioPrimeGuard";
import { NuboBuildFooter } from "@/components/NuboBuildFooter";
import { NuboInlineMusicPlayer } from "@/components/NuboInlineMusicPlayer";
import { NuboLanguageModeSelector } from "@/components/NuboLanguageModeSelector";
import { NuboMultilingualRuntime } from "@/components/NuboMultilingualRuntime";
import { NuboMusicSoundEnhancer } from "@/components/NuboMusicSoundEnhancer";
import { NuboSmartNoiseRuntime } from "@/components/NuboSmartNoiseRuntime";
import { NuboVoiceConsole } from "@/components/NuboVoiceConsole";
import { NuboVoiceQuickSelector } from "@/components/NuboVoiceQuickSelector";
import { NuboVoiceTuningPanel } from "@/components/NuboVoiceTuningPanel";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <main className="shell">
      <NuboSmartNoiseRuntime />
      <NuboAudioPrimeGuard />
      <NuboVoiceConsole />
      <NuboMultilingualRuntime />
      <NuboLanguageModeSelector />
      <NuboVoiceQuickSelector />
      <NuboVoiceTuningPanel />
      <NuboInlineMusicPlayer />
      <NuboMusicSoundEnhancer />
      <section className="hero">
        <div className="eyebrow">AINUBO HOTEL INTELLIGENT CONCIERGE</div>
        <h1>NUBO</h1>
        <p className="subtitle">
          AINUBO Hotel 智慧旅館管家｜母語級國語・快速多語切換・低延遲回覆・智慧降噪・背景停止雲端收音
        </p>
      </section>

      <section
        aria-label="Google Home"
        style={{
          width: "min(920px, calc(100% - 24px))",
          margin: "0 auto 18px",
          padding: "16px 18px",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 18,
          background: "rgba(8, 16, 30, 0.72)",
          backdropFilter: "blur(14px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>NUBO × Google Home</div>
          <div style={{ opacity: 0.76, marginTop: 4, fontSize: 14 }}>
            連接住宅、掃描房間與裝置，設定這台 NUBO 的預設房間並測試開燈／關燈。
          </div>
        </div>
        <Link
          href="/smart-home"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 44,
            padding: "0 18px",
            borderRadius: 999,
            background: "#ffffff",
            color: "#111827",
            fontWeight: 800,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          連接 Google Home
        </Link>
      </section>

      <DeferredDashboardCenters />
      <NuboBuildFooter />
    </main>
  );
}
