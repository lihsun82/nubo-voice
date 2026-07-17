declare module "@/components/NuboLiveLatencyProbe" {
  import type { ComponentType } from "react";
  export const NuboLiveLatencyProbe: ComponentType;
}

declare module "@/components/NuboLiveLatencyPanel" {
  import type { ComponentType } from "react";
  export const NuboLiveLatencyPanel: ComponentType;
}

declare module "@/lib/nubo-live-latency" {
  export type NuboLiveLatencySnapshot = {
    sessionId: number;
    updatedAt: number;
    connectionStartedAt: number | null;
    tokenStartedAt: number | null;
    tokenFinishedAt: number | null;
    tokenRoundTripMs: number | null;
    tokenServerMs: number | null;
    websocketCreatedAt: number | null;
    websocketOpenAt: number | null;
    websocketOpenMs: number | null;
    setupSentAt: number | null;
    setupCompleteAt: number | null;
    setupHandshakeMs: number | null;
    microphoneReadyAt: number | null;
    microphoneReadyMs: number | null;
    voiceReadyMs: number | null;
    firstAudioUploadAt: number | null;
    audioPacketCount: number;
    userTranscriptFirstAt: number | null;
    userTranscriptLastAt: number | null;
    lastUserText: string;
    toolCallAt: number | null;
    toolNames: string[];
    toolResponseAt: number | null;
    toolDurationMs: number | null;
    firstModelTextAt: number | null;
    firstModelAudioAt: number | null;
    transcriptToFirstAudioMs: number | null;
    toolResponseToFirstAudioMs: number | null;
    turnCompleteAt: number | null;
    websocketClosedAt: number | null;
    websocketCloseCode: number | null;
    websocketCloseReason: string;
    error: string;
  };

  export function installNuboLiveLatencyProbe(): void;
  export function uninstallNuboLiveLatencyProbe(): void;
  export function getNuboLiveLatencySnapshot(): NuboLiveLatencySnapshot;
  export function subscribeNuboLiveLatency(
    listener: (snapshot: NuboLiveLatencySnapshot) => void,
  ): () => void;
  export function resetNuboLiveLatency(): void;
}
