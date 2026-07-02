"use client";

import { useEffect, useState } from "react";
import NuboV12Shell from "@/components/v12/NuboV12Shell";

type Briefing = {
  title: string;
  summary: string;
  metrics?: {
    logs: number;
    notifications: number;
    warnings: number;
    errors: number;
    smartHomeEvents: number;
  };
  priorities?: string[];
};

export default function BriefingPage() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);

  async function loadBriefing() {
    const res = await fetch("/api/v12/briefing", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setBriefing(data);
  }

  useEffect(() => {
    loadBriefing();
  }, []);

  return (
    <NuboV12Shell title="Briefing 今日簡報">
      <section className="nubo-page-grid">
        <div className="nubo-panel nubo-full-panel">
          <div className="nubo-panel-head">
            <h2>{briefing?.title || "NUBO 今日簡報"}</h2>
            <span>Daily Briefing</span>
          </div>
          <p className="nubo-briefing-main">
            {briefing?.summary || "正在讀取今日簡報..."}
          </p>

          <div className="nubo-mini-grid">
            <div><strong>{briefing?.metrics?.logs ?? 0}</strong><span>Logs</span></div>
            <div><strong>{briefing?.metrics?.warnings ?? 0}</strong><span>Warnings</span></div>
            <div><strong>{briefing?.metrics?.errors ?? 0}</strong><span>Errors</span></div>
          </div>
        </div>

        <div className="nubo-panel nubo-full-panel">
          <div className="nubo-panel-head">
            <h2>優先事項</h2>
            <span>Priorities</span>
          </div>

          <div className="nubo-flow-steps">
            {(briefing?.priorities || []).map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </section>
    </NuboV12Shell>
  );
}
