"use client";

export const NUBO_VOICE_DIAGNOSTICS_KEY = "nubo_voice_diagnostics_v1";

type VoiceLatencyStage = "token" | "webSocket" | "sessionSetup" | "speechEnd" | "modelAudio" | "playbackBuffer" | "pms";

export type VoiceDiagnostics = {
  startedAt: string;
  receivedChunks: number;
  longChunkGaps: number;
  maxChunkGapMs: number;
  playbackUnderruns: number;
  maxPlaybackGapMs: number;
  captureCallbackGaps: number;
  maxCaptureGapMs: number;
  serverInterruptions: number;
  unexpectedDisconnects: number;
  maxSocketBufferedBytes: number;
  latencyMs?: Partial<Record<VoiceLatencyStage, number>>;
};

let report: VoiceDiagnostics | null = null;
let lastChunkAt = 0;
let lastSavedAt = 0;

function persist(force = false) {
  if (!report || typeof window === "undefined") return;
  const now = Date.now();
  if (!force && now - lastSavedAt < 1000) return;
  lastSavedAt = now;
  try {
    window.localStorage.setItem(NUBO_VOICE_DIAGNOSTICS_KEY, JSON.stringify(report));
  } catch {
    // Diagnostics must never interrupt voice playback.
  }
}

export function startVoiceDiagnostics() {
  report = {
    startedAt: new Date().toISOString(),
    receivedChunks: 0,
    longChunkGaps: 0,
    maxChunkGapMs: 0,
    playbackUnderruns: 0,
    maxPlaybackGapMs: 0,
    captureCallbackGaps: 0,
    maxCaptureGapMs: 0,
    serverInterruptions: 0,
    unexpectedDisconnects: 0,
    maxSocketBufferedBytes: 0,
  };
  lastChunkAt = 0;
  persist(true);
}

export function recordIncomingAudioChunk() {
  if (!report) return;
  const now = Date.now();
  if (lastChunkAt) {
    const gap = now - lastChunkAt;
    if (gap > 350) {
      report.longChunkGaps += 1;
      report.maxChunkGapMs = Math.max(report.maxChunkGapMs, gap);
    }
  }
  lastChunkAt = now;
  report.receivedChunks += 1;
  persist();
}

export function finishIncomingAudioTurn() {
  lastChunkAt = 0;
  persist(true);
}

export function recordPlaybackUnderrun(gapMs: number) {
  if (!report || gapMs <= 20) return;
  report.playbackUnderruns += 1;
  report.maxPlaybackGapMs = Math.max(report.maxPlaybackGapMs, Math.round(gapMs));
  persist();
}

export function recordCaptureCallbackGap(gapMs: number) {
  if (!report || gapMs <= 120) return;
  report.captureCallbackGaps += 1;
  report.maxCaptureGapMs = Math.max(report.maxCaptureGapMs, Math.round(gapMs));
  persist();
}

export function recordServerInterruption() {
  if (!report) return;
  report.serverInterruptions += 1;
  finishIncomingAudioTurn();
}

export function recordUnexpectedDisconnect() {
  if (!report) return;
  report.unexpectedDisconnects += 1;
  persist(true);
}

export function recordSocketBuffer(bytes: number) {
  if (!report || bytes <= report.maxSocketBufferedBytes) return;
  report.maxSocketBufferedBytes = bytes;
  persist();
}

export function recordVoiceLatency(stage: VoiceLatencyStage, milliseconds: number) {
  if (!report || !Number.isFinite(milliseconds) || milliseconds < 0) return;
  (report.latencyMs ??= {})[stage] = Math.round(milliseconds);
  persist(true);
}

export function resetVoiceReplyLatency() {
  if (!report?.latencyMs) return;
  delete report.latencyMs.speechEnd;
  delete report.latencyMs.modelAudio;
  delete report.latencyMs.playbackBuffer;
  delete report.latencyMs.pms;
  persist(true);
}

export function readVoiceDiagnostics(): VoiceDiagnostics | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NUBO_VOICE_DIAGNOSTICS_KEY);
    return raw ? JSON.parse(raw) as VoiceDiagnostics : null;
  } catch {
    return null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => persist(true));
}
