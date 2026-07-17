"use client";

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
  microphoneRequestedAt: number | null;
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

const EVENT_NAME = "nubo-live-latency-update";
const STORAGE_KEY = "nubo_live_latency_v1";
const GEMINI_SOCKET_PATTERN = /generativelanguage\.googleapis\.com\/ws\//i;

const emptySnapshot: NuboLiveLatencySnapshot = {
  sessionId: 0,
  updatedAt: 0,
  connectionStartedAt: null,
  tokenStartedAt: null,
  tokenFinishedAt: null,
  tokenRoundTripMs: null,
  tokenServerMs: null,
  websocketCreatedAt: null,
  websocketOpenAt: null,
  websocketOpenMs: null,
  setupSentAt: null,
  setupCompleteAt: null,
  setupHandshakeMs: null,
  microphoneRequestedAt: null,
  microphoneReadyAt: null,
  microphoneReadyMs: null,
  voiceReadyMs: null,
  firstAudioUploadAt: null,
  audioPacketCount: 0,
  userTranscriptFirstAt: null,
  userTranscriptLastAt: null,
  lastUserText: "",
  toolCallAt: null,
  toolNames: [],
  toolResponseAt: null,
  toolDurationMs: null,
  firstModelTextAt: null,
  firstModelAudioAt: null,
  transcriptToFirstAudioMs: null,
  toolResponseToFirstAudioMs: null,
  turnCompleteAt: null,
  websocketClosedAt: null,
  websocketCloseCode: null,
  websocketCloseReason: "",
  error: "",
};

let snapshot: NuboLiveLatencySnapshot = { ...emptySnapshot };
let installed = false;
let sessionCounter = 0;
let originalFetch: typeof window.fetch | null = null;
let originalSocketSend: WebSocket["send"] | null = null;
const instrumentedSockets = new WeakSet<WebSocket>();

function now() {
  return Date.now();
}

function publish(patch: Partial<NuboLiveLatencySnapshot>) {
  snapshot = {
    ...snapshot,
    ...patch,
    updatedAt: now(),
  };

  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Diagnostics must never interrupt NUBO voice.
  }

  window.dispatchEvent(
    new CustomEvent<NuboLiveLatencySnapshot>(EVENT_NAME, {
      detail: { ...snapshot },
    }),
  );
}

function resetTurnMetrics() {
  snapshot = {
    ...snapshot,
    userTranscriptFirstAt: null,
    userTranscriptLastAt: null,
    lastUserText: "",
    toolCallAt: null,
    toolNames: [],
    toolResponseAt: null,
    toolDurationMs: null,
    firstModelTextAt: null,
    firstModelAudioAt: null,
    transcriptToFirstAudioMs: null,
    toolResponseToFirstAudioMs: null,
    turnCompleteAt: null,
  };
}

function beginSession(openAt: number) {
  sessionCounter += 1;
  const tokenFields = {
    tokenStartedAt: snapshot.tokenStartedAt,
    tokenFinishedAt: snapshot.tokenFinishedAt,
    tokenRoundTripMs: snapshot.tokenRoundTripMs,
    tokenServerMs: snapshot.tokenServerMs,
  };

  snapshot = {
    ...emptySnapshot,
    ...tokenFields,
    sessionId: sessionCounter,
    updatedAt: openAt,
    connectionStartedAt: snapshot.tokenStartedAt ?? openAt,
    websocketCreatedAt: snapshot.tokenFinishedAt ?? openAt,
    websocketOpenAt: openAt,
    websocketOpenMs:
      snapshot.tokenFinishedAt === null
        ? null
        : Math.max(0, openAt - snapshot.tokenFinishedAt),
  };
  publish({});
}

function readFetchUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

async function parseSocketPayload(data: unknown): Promise<Record<string, unknown> | null> {
  try {
    let text: string;
    if (typeof data === "string") text = data;
    else if (data instanceof Blob) text = await data.text();
    else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    else if (ArrayBuffer.isView(data)) text = new TextDecoder().decode(data);
    else return null;
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function inspectServerMessage(message: Record<string, unknown>) {
  const receivedAt = now();

  if (message.setupComplete !== undefined) {
    publish({
      setupCompleteAt: receivedAt,
      setupHandshakeMs:
        snapshot.setupSentAt === null
          ? null
          : Math.max(0, receivedAt - snapshot.setupSentAt),
    });
  }

  const toolCall = readObject(message.toolCall);
  const functionCalls = toolCall?.functionCalls;
  if (Array.isArray(functionCalls) && functionCalls.length > 0) {
    publish({
      toolCallAt: snapshot.toolCallAt ?? receivedAt,
      toolNames: functionCalls.map((item) => {
        const call = readObject(item);
        return typeof call?.name === "string" ? call.name : "未知工具";
      }),
    });
  }

  const serverContent = readObject(message.serverContent);
  if (!serverContent) return;

  const inputTranscription = readObject(serverContent.inputTranscription);
  const userText = inputTranscription?.text;
  if (typeof userText === "string" && userText.trim()) {
    if (snapshot.turnCompleteAt !== null) {
      resetTurnMetrics();
    }

    const transcriptAt = now();
    publish({
      userTranscriptFirstAt: snapshot.userTranscriptFirstAt ?? transcriptAt,
      userTranscriptLastAt: transcriptAt,
      lastUserText: userText.trim().slice(-240),
    });
  }

  const outputTranscription = readObject(serverContent.outputTranscription);
  const modelText = outputTranscription?.text;
  if (typeof modelText === "string" && modelText.trim()) {
    publish({ firstModelTextAt: snapshot.firstModelTextAt ?? now() });
  }

  const modelTurn = readObject(serverContent.modelTurn);
  const parts = modelTurn?.parts;
  if (Array.isArray(parts) && snapshot.firstModelAudioAt === null) {
    const hasAudio = parts.some((item) => {
      const part = readObject(item);
      const inlineData = readObject(part?.inlineData);
      return typeof inlineData?.data === "string" && inlineData.data.length > 0;
    });

    if (hasAudio) {
      const audioAt = now();
      publish({
        firstModelAudioAt: audioAt,
        transcriptToFirstAudioMs:
          snapshot.userTranscriptLastAt === null
            ? null
            : Math.max(0, audioAt - snapshot.userTranscriptLastAt),
        toolResponseToFirstAudioMs:
          snapshot.toolResponseAt === null
            ? null
            : Math.max(0, audioAt - snapshot.toolResponseAt),
      });
    }
  }

  if (serverContent.turnComplete === true) {
    publish({ turnCompleteAt: now() });
  }
}

function attachSocketListeners(socket: WebSocket) {
  if (instrumentedSockets.has(socket)) return;
  instrumentedSockets.add(socket);

  socket.addEventListener("message", (event) => {
    void parseSocketPayload(event.data).then((message) => {
      if (message) inspectServerMessage(message);
    });
  });

  socket.addEventListener("close", (event) => {
    publish({
      websocketClosedAt: now(),
      websocketCloseCode: event.code,
      websocketCloseReason: event.reason || "未提供原因",
    });
  });

  socket.addEventListener("error", () => {
    publish({ error: "Gemini Live WebSocket發生錯誤" });
  });
}

function inspectClientMessage(socket: WebSocket, data: unknown) {
  if (typeof data !== "string") return;

  try {
    const message = JSON.parse(data) as Record<string, unknown>;
    const sentAt = now();

    if (message.setup !== undefined) {
      beginSession(sentAt);
      attachSocketListeners(socket);
      publish({ setupSentAt: sentAt });
    }

    const realtimeInput = readObject(message.realtimeInput);
    if (readObject(realtimeInput?.audio)) {
      const firstPacket = snapshot.firstAudioUploadAt === null;
      publish({
        firstAudioUploadAt: snapshot.firstAudioUploadAt ?? sentAt,
        audioPacketCount: snapshot.audioPacketCount + 1,
        microphoneReadyAt: snapshot.microphoneReadyAt ?? sentAt,
        microphoneReadyMs:
          firstPacket && snapshot.setupCompleteAt !== null
            ? Math.max(0, sentAt - snapshot.setupCompleteAt)
            : snapshot.microphoneReadyMs,
        voiceReadyMs:
          firstPacket && snapshot.connectionStartedAt !== null
            ? Math.max(0, sentAt - snapshot.connectionStartedAt)
            : snapshot.voiceReadyMs,
      });
    }

    if (message.toolResponse !== undefined) {
      publish({
        toolResponseAt: sentAt,
        toolDurationMs:
          snapshot.toolCallAt === null
            ? null
            : Math.max(0, sentAt - snapshot.toolCallAt),
      });
    }
  } catch {
    // Ignore non-JSON client messages.
  }
}

function installFetchProbe() {
  originalFetch = window.fetch.bind(window);
  const baseFetch = originalFetch;

  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const url = readFetchUrl(args[0]);
    if (!url.includes("/api/gemini-token")) {
      return baseFetch(...args);
    }

    const startedAt = now();
    publish({ tokenStartedAt: startedAt });

    try {
      const response = await baseFetch(...args);
      const finishedAt = now();
      const payload = (await response.clone().json().catch(() => ({}))) as {
        elapsedMs?: unknown;
      };

      publish({
        tokenFinishedAt: finishedAt,
        tokenRoundTripMs: Math.max(0, finishedAt - startedAt),
        tokenServerMs:
          typeof payload.elapsedMs === "number" ? payload.elapsedMs : null,
      });
      return response;
    } catch (error) {
      publish({
        tokenFinishedAt: now(),
        error:
          error instanceof Error ? error.message : "Gemini Token請求失敗",
      });
      throw error;
    }
  };
}

function installSocketProbe() {
  originalSocketSend = WebSocket.prototype.send;
  const baseSend = originalSocketSend;

  WebSocket.prototype.send = function sendWithLatencyProbe(
    data: string | ArrayBufferLike | Blob | ArrayBufferView,
  ) {
    if (GEMINI_SOCKET_PATTERN.test(this.url)) {
      inspectClientMessage(this, data);
    }
    baseSend.call(this, data);
  };
}

export function installNuboLiveLatencyProbe() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  installFetchProbe();
  installSocketProbe();
}

export function uninstallNuboLiveLatencyProbe() {
  if (typeof window === "undefined" || !installed) return;

  if (originalFetch) {
    window.fetch = originalFetch;
    originalFetch = null;
  }
  if (originalSocketSend) {
    WebSocket.prototype.send = originalSocketSend;
    originalSocketSend = null;
  }
  installed = false;
}

export function getNuboLiveLatencySnapshot() {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        snapshot = {
          ...emptySnapshot,
          ...(JSON.parse(raw) as Partial<NuboLiveLatencySnapshot>),
        };
      }
    } catch {
      // Use current in-memory data.
    }
  }
  return { ...snapshot };
}

export function subscribeNuboLiveLatency(
  listener: (next: NuboLiveLatencySnapshot) => void,
) {
  if (typeof window === "undefined") return () => {};

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<NuboLiveLatencySnapshot>;
    listener(customEvent.detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

export function resetNuboLiveLatency() {
  sessionCounter += 1;
  snapshot = {
    ...emptySnapshot,
    sessionId: sessionCounter,
    updatedAt: now(),
  };
  publish({});
}
