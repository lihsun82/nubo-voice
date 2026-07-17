"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getNuboLiveLatencySnapshot,
  resetNuboLiveLatency,
  subscribeNuboLiveLatency,
} from "@/lib/nubo-live-latency";

function ms(value) {
  return value === null || value === undefined
    ? "尚未量到"
    : `${Math.round(value)} ms`;
}

function formatTime(value) {
  if (!value) return "尚未發生";
  return new Date(value).toLocaleTimeString("zh-TW", {
    hour12: false,
  });
}

function buildDiagnosis(snapshot) {
  const notes = [];

  if (
    snapshot.tokenRoundTripMs !== null &&
    snapshot.tokenRoundTripMs >= 800
  ) {
    notes.push(
      `Token往返${Math.round(snapshot.tokenRoundTripMs)}ms，手機到Railway的連線仍偏慢。`,
    );
  }

  if (
    snapshot.websocketOpenMs !== null &&
    snapshot.websocketOpenMs >= 1000
  ) {
    notes.push(
      `手機直接連到Google Gemini WebSocket花了${Math.round(snapshot.websocketOpenMs)}ms，主要瓶頸在手機或Wi-Fi到Google的網路路由。`,
    );
  }

  if (
    snapshot.setupHandshakeMs !== null &&
    snapshot.setupHandshakeMs >= 1000
  ) {
    notes.push(
      `Gemini收到設定後花了${Math.round(snapshot.setupHandshakeMs)}ms才完成語音工作階段，連線設定或Google端回應偏慢。`,
    );
  }

  if (
    snapshot.microphoneReadyMs !== null &&
    snapshot.microphoneReadyMs >= 800
  ) {
    notes.push(
      `Gemini設定完成後，手機麥克風與第一包音訊又花了${Math.round(snapshot.microphoneReadyMs)}ms才就緒。`,
    );
  }

  if (
    snapshot.transcriptToFirstAudioMs !== null &&
    snapshot.transcriptToFirstAudioMs >= 2500
  ) {
    if (
      snapshot.toolDurationMs !== null &&
      snapshot.toolDurationMs >= 1500
    ) {
      notes.push(
        `這次回覆主要卡在工具執行，工具耗時${Math.round(snapshot.toolDurationMs)}ms。`,
      );
    } else {
      notes.push(
        `Gemini辨識到使用者文字後，等了${Math.round(snapshot.transcriptToFirstAudioMs)}ms才收到第一段AI語音；瓶頸較可能是語音斷句、模型生成或手機到Google的WebSocket品質。`,
      );
    }
  }

  if (
    snapshot.toolResponseToFirstAudioMs !== null &&
    snapshot.toolResponseToFirstAudioMs >= 1500
  ) {
    notes.push(
      `工具已回傳後，Gemini又花了${Math.round(snapshot.toolResponseToFirstAudioMs)}ms才開始說話，延遲在Gemini恢復生成而不是NUBO工具。`,
    );
  }

  if (
    snapshot.websocketCloseCode !== null &&
    snapshot.websocketCloseCode !== 1000
  ) {
    notes.push(
      `WebSocket曾以代碼${snapshot.websocketCloseCode}中斷，原因：${snapshot.websocketCloseReason || "未提供"}。`,
    );
  }

  const hasTurnMeasurement =
    snapshot.userTranscriptLastAt !== null ||
    snapshot.firstModelAudioAt !== null ||
    snapshot.toolCallAt !== null;

  if (notes.length === 0 && hasTurnMeasurement) {
    notes.push(
      "這次全鏈路數據沒有出現明顯異常；請再測兩到三次，確認是否只有特定問題或特定工具較慢。",
    );
  }

  if (!hasTurnMeasurement) {
    notes.push(
      "請先啟動NUBO並問一個簡單問題，例如「現在幾點」，面板會自動記錄完整語音鏈路。",
    );
  }

  return notes;
}

export function NuboLiveLatencyPanel() {
  const [snapshot, setSnapshot] = useState(() =>
    getNuboLiveLatencySnapshot(),
  );

  useEffect(() => {
    setSnapshot(getNuboLiveLatencySnapshot());
    return subscribeNuboLiveLatency(setSnapshot);
  }, []);

  const diagnosis = useMemo(
    () => buildDiagnosis(snapshot),
    [snapshot],
  );

  const reset = () => {
    resetNuboLiveLatency();
    setSnapshot(getNuboLiveLatencySnapshot());
  };

  return (
    <details className="nubo-latency-panel" open>
      <summary>Gemini Live 全鏈路診斷</summary>
      <p>
        這裡直接量測手機、Railway Token、Google WebSocket、麥克風、語音辨識、工具執行與第一段AI聲音。
      </p>

      <button
        type="button"
        className="secondary"
        onClick={reset}
      >
        清除數據，重新測一次
      </button>

      <div className="nubo-latency-result">
        <p>
          Token往返：{ms(snapshot.tokenRoundTripMs)}｜Token伺服器：
          {ms(snapshot.tokenServerMs)}
        </p>
        <p>
          Google WebSocket開啟：{ms(snapshot.websocketOpenMs)}｜Gemini設定完成：
          {ms(snapshot.setupHandshakeMs)}
        </p>
        <p>
          麥克風與首包音訊：{ms(snapshot.microphoneReadyMs)}｜按下啟動到可聆聽：
          {ms(snapshot.voiceReadyMs)}
        </p>
        <p>
          辨識文字到第一段AI聲音：{ms(snapshot.transcriptToFirstAudioMs)}｜工具耗時：
          {ms(snapshot.toolDurationMs)}
        </p>
        <p>
          工具回傳到AI開始說話：{ms(snapshot.toolResponseToFirstAudioMs)}｜音訊上傳封包：
          {Number(snapshot.audioPacketCount || 0).toLocaleString()}
        </p>
        <p>
          最近辨識：{snapshot.lastUserText || "尚未辨識到問題"}
        </p>
        <p>
          工作階段：{snapshot.sessionId || "尚未啟動"}｜最後更新：
          {formatTime(snapshot.updatedAt)}
        </p>
        {snapshot.websocketCloseCode !== null ? (
          <p>
            最近斷線：{snapshot.websocketCloseCode}／
            {snapshot.websocketCloseReason || "未提供原因"}
          </p>
        ) : null}
        {snapshot.error ? (
          <div className="error">{snapshot.error}</div>
        ) : null}
        <ul>
          {diagnosis.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}
