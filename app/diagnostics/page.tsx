"use client";

import { useEffect, useState } from "react";
import { readVoiceDiagnostics, type VoiceDiagnostics } from "@/lib/nubo-voice-diagnostics";

export default function VoiceDiagnosticsPage() {
  const [report, setReport] = useState<VoiceDiagnostics | null>(null);
  useEffect(() => setReport(readVoiceDiagnostics()), []);
  const latency = report?.latencyMs;

  const rows = report ? [
    ["開始時間", report.startedAt],
    ["收到的語音片段", report.receivedChunks],
    ["語音片段間隔超過 350 毫秒", report.longChunkGaps],
    ["最大語音片段間隔", report.maxChunkGapMs + " 毫秒"],
    ["播放短時間重新緩衝", report.playbackUnderruns],
    ["最長重新緩衝", report.maxPlaybackGapMs + " 毫秒"],
    ["收音回呼延遲次數", report.captureCallbackGaps],
    ["最大收音回呼延遲", report.maxCaptureGapMs + " 毫秒"],
    ["Gemini 發出中斷訊號", report.serverInterruptions],
    ["意外斷線", report.unexpectedDisconnects],
    ["最高待傳送資料", report.maxSocketBufferedBytes + " 位元組"],
    ...([
      ["取得語音通行憑證", latency?.token],
      ["開啟語音連線", latency?.webSocket],
      ["建立通話工作階段", latency?.sessionSetup],
      ["偵測到說完至收到首段模型音訊", latency?.modelAudio],
      ["首段模型音訊等待送入播放器", latency?.playbackBuffer],
      ["最近一次 PMS 查詢", latency?.pms],
    ] as const).flatMap(([label, value]) => typeof value === "number" ? [[label, value + " 毫秒"]] : []),
  ] : [];

  return (
    <main style={{ minHeight: "100svh", maxWidth: 700, margin: "auto", padding: 24, color: "#eafaff", fontFamily: "sans-serif" }}>
      <h1>NUBO 語音診斷</h1>
      <p>只顯示這台平板最近一次對話的技術數值；不記錄或上傳對話內容。</p>
      {report ? (
        <dl style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "12px 20px", marginTop: 30 }}>
          {rows.map(([label, value]) => (
            <div key={String(label)} style={{ display: "contents" }}>
              <dt>{label}</dt><dd style={{ margin: 0, textAlign: "right" }}>{value}</dd>
            </div>
          ))}
        </dl>
      ) : <p>目前沒有對話資料。請先回到 NUBO 首頁對話，再開啟此頁。</p>}
    </main>
  );
}
