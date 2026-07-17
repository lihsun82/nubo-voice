"use client";

import { useState } from "react";

type NetworkInformationLike = {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
};

type LatencyResult = {
  testedAt: string;
  providersMs: number;
  tokenRoundTripMs: number;
  tokenServerMs: number | null;
  fps: number;
  eventLoopLagMs: number;
  effectiveType: string;
  downlinkMbps: number | null;
  browserRttMs: number | null;
  saveData: boolean;
  diagnosis: string[];
};

async function timedJson(url: string) {
  const startedAt = performance.now();
  const response = await fetch(
    `${url}${url.includes("?") ? "&" : "?"}diagnostic=${Date.now()}`,
    { cache: "no-store" },
  );
  const payload = await response.json();
  const elapsedMs = performance.now() - startedAt;
  if (!response.ok) {
    throw new Error(payload.error ?? `${url}測試失敗`);
  }
  return { payload, elapsedMs };
}

async function measureFps(durationMs = 1_200) {
  const startedAt = performance.now();
  let frames = 0;

  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      frames += 1;
      if (now - startedAt >= durationMs) {
        resolve();
        return;
      }
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });

  const actualDuration = performance.now() - startedAt;
  return (frames * 1000) / actualDuration;
}

async function measureEventLoopLag() {
  const expected = performance.now() + 120;
  await new Promise<void>((resolve) =>
    window.setTimeout(resolve, 120),
  );
  return Math.max(0, performance.now() - expected);
}

function buildDiagnosis(result: Omit<LatencyResult, "diagnosis">) {
  const notes: string[] = [];

  if (
    result.browserRttMs !== null &&
    result.browserRttMs >= 350
  ) {
    notes.push(
      `手機網路RTT約${result.browserRttMs}ms，這會直接拖慢即時語音上傳與回覆。`,
    );
  }

  if (
    result.effectiveType === "slow-2g" ||
    result.effectiveType === "2g" ||
    result.effectiveType === "3g"
  ) {
    notes.push(
      `瀏覽器判定網路為${result.effectiveType}，不適合持續即時語音。`,
    );
  }

  if (result.saveData) {
    notes.push("手機已開啟節省數據模式，瀏覽器可能限制背景與即時連線。");
  }

  if (result.providersMs >= 1_200) {
    notes.push(
      `/api/providers往返${Math.round(result.providersMs)}ms，手機到Railway的網路或Railway冷啟動偏慢。`,
    );
  }

  if (
    result.tokenRoundTripMs >= 1_200 &&
    result.tokenServerMs !== null &&
    result.tokenServerMs < 150
  ) {
    notes.push(
      `Token伺服器只處理${Math.round(result.tokenServerMs)}ms，但手機往返共${Math.round(result.tokenRoundTripMs)}ms，主要是網路延遲。`,
    );
  } else if (
    result.tokenServerMs !== null &&
    result.tokenServerMs >= 800
  ) {
    notes.push(
      `Gemini Token建立耗時${Math.round(result.tokenServerMs)}ms，Google API或Railway對外連線偏慢。`,
    );
  }

  if (result.fps < 28) {
    notes.push(
      `手機畫面只有約${Math.round(result.fps)} FPS，裝置渲染或省電模式正在搶占語音處理資源。`,
    );
  }

  if (result.eventLoopLagMs >= 120) {
    notes.push(
      `瀏覽器主執行緒延遲${Math.round(result.eventLoopLagMs)}ms，代表手機CPU或頁面工作量過高。`,
    );
  }

  if (notes.length === 0) {
    notes.push(
      "頁面、Railway與瀏覽器基礎延遲正常；剩餘問題較可能在手機到Gemini WebSocket的上傳品質或語音斷句偵測。",
    );
  }

  return notes;
}

export function NuboLatencyPanel() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] =
    useState<LatencyResult | null>(null);

  const runTest = async () => {
    setRunning(true);
    setError("");

    try {
      const connection = (
        navigator as Navigator & {
          connection?: NetworkInformationLike;
        }
      ).connection;

      const [providers, token, fps, eventLoopLagMs] =
        await Promise.all([
          timedJson("/api/providers"),
          timedJson("/api/gemini-token?warm=1"),
          measureFps(),
          measureEventLoopLag(),
        ]);

      const base = {
        testedAt: new Date().toISOString(),
        providersMs: providers.elapsedMs,
        tokenRoundTripMs: token.elapsedMs,
        tokenServerMs:
          typeof token.payload.elapsedMs === "number"
            ? token.payload.elapsedMs
            : null,
        fps,
        eventLoopLagMs,
        effectiveType:
          connection?.effectiveType ?? "unknown",
        downlinkMbps:
          typeof connection?.downlink === "number"
            ? connection.downlink
            : null,
        browserRttMs:
          typeof connection?.rtt === "number"
            ? connection.rtt
            : null,
        saveData: connection?.saveData === true,
      };

      setResult({
        ...base,
        diagnosis: buildDiagnosis(base),
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "延遲診斷失敗",
      );
    } finally {
      setRunning(false);
    }
  };

  return (
    <details className="nubo-latency-panel">
      <summary>手機延遲診斷</summary>
      <p>
        按下後會測試手機到Railway的往返、Gemini Token處理、畫面FPS與瀏覽器主執行緒負載。
      </p>
      <button
        type="button"
        className="secondary"
        disabled={running}
        onClick={() => void runTest()}
      >
        {running ? "診斷中…" : "開始延遲診斷"}
      </button>

      {error ? <div className="error">{error}</div> : null}

      {result ? (
        <div className="nubo-latency-result">
          <p>
            Railway設定：{Math.round(result.providersMs)} ms｜Token往返：
            {Math.round(result.tokenRoundTripMs)} ms｜Token伺服器：
            {result.tokenServerMs === null
              ? "未知"
              : `${Math.round(result.tokenServerMs)} ms`}
          </p>
          <p>
            畫面：{Math.round(result.fps)} FPS｜主執行緒延遲：
            {Math.round(result.eventLoopLagMs)} ms｜網路：
            {result.effectiveType}
            {result.browserRttMs === null
              ? ""
              : ` / RTT ${result.browserRttMs} ms`}
            {result.downlinkMbps === null
              ? ""
              : ` / ${result.downlinkMbps} Mbps`}
          </p>
          <ul>
            {result.diagnosis.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </details>
  );
}
