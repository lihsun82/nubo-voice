"use client";

import { useEffect, useState } from "react";
import NuboV12Shell from "@/components/v12/NuboV12Shell";

type LogItem = {
  id: string;
  time: string;
  source: string;
  action: string;
  status: string;
  detail: string;
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogItem[]>([]);

  async function loadLogs() {
    const res = await fetch("/api/v12/logs", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setLogs(Array.isArray(data.logs) ? data.logs : []);
  }

  useEffect(() => {
    loadLogs();
    const timer = window.setInterval(loadLogs, 5000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <NuboV12Shell title="Activity Logs 活動紀錄">
      <section className="nubo-page-grid">
        <div className="nubo-panel nubo-full-panel">
          <div className="nubo-panel-head">
            <h2>Live Activity</h2>
            <span>每 5 秒刷新</span>
          </div>

          <div className="nubo-table-like">
            {logs.length === 0 ? (
              <div className="nubo-empty-state">尚無活動紀錄。</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="nubo-table-row">
                  <span>{log.time}</span>
                  <div>
                    <strong>{log.source} · {log.action}</strong>
                    <p>{log.detail}</p>
                  </div>
                  <span>{log.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </NuboV12Shell>
  );
}
