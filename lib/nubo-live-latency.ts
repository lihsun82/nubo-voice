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
let restoreHandlers: Array<() => void> = [];

function nowEpoch() {
  return Date.now();
}

function publish(patch: Partial<NuboLiveLatencySnapshot>) {
  snapshot = {
    ...snapshot,
    ...patch,
    updatedAt: nowEpoch(),
  };

  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(snapshot),
    );
  } catch {
    // Diagnostics must never interrupt voice operation.
  }

  window.dispatchEvent(
    new CustomEvent<NuboLiveLatencySnapshot>(EVENT_NAME, {
      detail: { ...snapshot },
    }),
  );
}

function resetTurnMetrics() {
  publish({
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
  });
}

function resetSessionMetrics() {
  sessionCounter += 1;
  const startedAt = nowEpoch();
  snapshot = {
    ...emptySnapshot,
    sessionId: sessionCounter,
    updatedAt: startedAt,
    connectionStartedAt: startedAt,
    websocketCreatedAt: startedAt,
  };
  publish({});
}

function readUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

async function parseSocketPayload(data: unknown): Promise<Record<string, any> | null> {
  try {
    let text: string;
    if (typeof data === "string") text = data;
    else if (data instanceof Blob) text = await data.text();
    else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    else if (ArrayBuffer.isView(data)) text = new TextDecoder().decode(data);
    else return null;
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return null;
  }
}

function inspectClientMessage(data: unknown) {
  if (typeof data !== "string") return;

  try {
    const message = JSON.parse(data) as Record<string, any>;
    const now = nowEpoch();

    if (message.setup) {
      publish({ setupSentAt: now });
    }

    if (message.realtimeInput?.audio) {
      publish({
        firstAudioUploadAt: snapshot.firstAudioUploadAt ?? now,
        audioPacketCount: snapshot.audioPacketCount + 1,
      });
    }

    if (message.toolResponse) {
      publish({
        toolResponseAt: now,
        toolDurationMs:
          snapshot.toolCallAt === null
            ? null
            : Math.max(0, now - snapshot.toolCallAt),
      });
    }
  } catch {
    // Ignore non-JSON WebSocket messages.
  }
}

function inspectServerMessage(message: Record<string, any>) {
  const now = nowEpoch();

  if (message.setupComplete) {
    publish({
      setupCompleteAt: now,
      setupHandshakeMs:
        snapshot.setupSentAt === null
          ? null
          : Math.max(0, now - snapshot.setupSentAt),
    });
  }

  const functionCalls = message.toolCall?.functionCalls;
  if (Array.isArray(functionCalls) && functionCalls.length > 0) {
    publish({
      toolCallAt: snapshot.toolCallAt ?? now,
      toolNames: functionCalls
        .map((call: { name?: unknown }) =>
          typeof call?.name === "string" ? call.name : "未知工具",
        )
        .filter(Boolean),
    });
  }

  const serverContent = message.serverContent;
  if (!serverContent || typeof serverContent !== "object") return;

  const userText = serverContent.inputTranscription?.text;
  if (typeof userText === "string" && userText.trim()) {
    /* A new transcript after a completed model turn starts a fresh measurement. */
    if (snapshot.turnCompleteAt !== null) {
      resetTurnMetrics();
    }

    const transcriptAt = nowEpoch();
    publish({
      userTranscriptFirstAt:
        snapshot.userTranscriptFirstAt ?? transcriptAt,
      userTranscriptLastAt: transcriptAt,
      lastUserText: userText.trim().slice(-240),
    });
  }

  const modelText = serverContent.outputTranscription?.text;
  if (typeof modelText === "string" && modelText.trim()) {
    publish({
      firstModelTextAt: snapshot.firstModelTextAt ?? nowEpoch(),
    });
  }

  const parts = serverContent.modelTurn?.parts;
  if (Array.isArray(parts)) {
    const hasAudio = parts.some(
      (part: Record<string, any>) =>
        typeof part?.inlineData?.data === "string" &&
        part.inlineData.data.length > 0,
    );

    if (hasAudio && snapshot.firstModelAudioAt === null) {
      const audioAt = nowEpoch();
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
    publish({ turnCompleteAt: nowEpoch() });
  }
}

function instrumentSocket(socket: WebSocket) {
  resetSessionMetrics();

  const originalSend = socket.send.bind(socket);
  socket.send = ((data: string | ArrayBufferLike | Blob | ArrayBufferView) => {
    inspectClientMessage(data);
    originalSend(data);
  }) as WebSocket["send"];

  socket.addEventListener("open", () => {
    const openedAt = nowEpoch();
    publish({
      websocketOpenAt: openedAt,
      websocketOpenMs:
        snapshot.websocketCreatedAt === null
          ? null
          : Math.max(0, openedAt - snapshot.websocketCreatedAt),
    });
  });

  socket.addEventListener("message", (event) => {
    void parseSocketPayload(event.data).then((message) => {
      if (message) inspectServerMessage(message);
    });
  });

  socket.addEventListener("close", (event) => {
    publish({
      websocketClosedAt: nowEpoch(),
      websocketCloseCode: event.code,
      websocketCloseReason: event.reason || "未提供原因",
    });
  });

  socket.addEventListener("error", () => {
    publish({ error: "Gemini Live WebSocket發生錯誤" });
  });
}

function installFetchProbe() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = readUrl(input);
    if (!url.includes("/api/gemini-token")) {
      return originalFetch(input, init);
    }

    const startedAt = nowEpoch();
    publish({ tokenStartedAt: startedAt });

    try {
      const response = await originalFetch(input, init);
      const finishedAt = nowEpoch();
      const payload = await response
        .clone()
        .json()
        .catch(() => ({}));

      publish({
        tokenFinishedAt: finishedAt,
        tokenRoundTripMs: Math.max(0, finishedAt - startedAt),
        tokenServerMs:
          typeof payload?.elapsedMs === "number"
            ? payload.elapsedMs
            : null,
      });

      return response;
    } catch (error) {
      publish({
        tokenFinishedAt: nowEpoch(),
        error:
          error instanceof Error
            ? error.message
            : "Gemini Token請求失敗",
      });
      throw error;
    }
  }) as typeof window.fetch;

  restoreHandlers.push(() => {
    window.fetch = originalFetch;
  });
}

function installWebSocketProbe() {
  const OriginalWebSocket = window.WebSocket;
  const WrappedWebSocket = new Proxy(OriginalWebSocket, {
    construct(target, args, newTarget) {
      const socket = Reflect.construct(
        target,
        args,
        newTarget,
      ) as WebSocket;
      const url = String(args[0] ?? "");
      if (GEMINI_SOCKET_PATTERN.test(url)) {
        instrumentSocket(socket);
      }
      return socket;
    },
  });

  window.WebSocket = WrappedWebSocket as typeof WebSocket;

  restoreHandlers.push(() => {
    if (window.WebSocket === WrappedWebSocket) {
      window.WebSocket = OriginalWebSocket;
    }
  });
}

function installMicrophoneProbe() {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.getUserMedia) return;

  const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
  const wrapped = async (constraints?: MediaStreamConstraints) => {
    const requestedAt = nowEpoch();
    publish({ microphoneRequestedAt: requestedAt });

    try {
      const stream = await originalGetUserMedia(constraints);
      const readyAt = nowEpoch();
      publish({
        microphoneReadyAt: readyAt,
        microphoneReadyMs: Math.max(0, readyAt - requestedAt),
        voiceReadyMs:
          snapshot.connectionStartedAt === null
            ? null
            : Math.max(0, readyAt - snapshot.connectionStartedAt),
      });
      return stream;
    } catch (error) {
      publish({
        error:
          error instanceof Error
            ? `麥克風：${error.message}`
            : "麥克風啟動失敗",
      });
      throw error;
    }
  };

  try {
    mediaDevices.getUserMedia = wrapped;
    restoreHandlers.push(() => {
      mediaDevices.getUserMedia = originalGetUserMedia;
    });
  } catch {
    // Some browsers expose getUserMedia as read-only. Other metrics still work.
  }
}

export function installNuboLiveLatencyProbe() {
  if (typeof window === "undefined" || installed) return;
  installed = true;
  restoreHandlers = [];

  installFetchProbe();
  installWebSocketProbe();
  installMicrophoneProbe();
}

export function uninstallNuboLiveLatencyProbe() {
  for (const restore of restoreHandlers.reverse()) {
    try {
      restore();
    } catch {
      // Ignore diagnostics cleanup failures.
    }
  }
  restoreHandlers = [];
  installed = false;
}

export function getNuboLiveLatencySnapshot() {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as Partial<NuboLiveLatencySnapshot>;
        snapshot = { ...emptySnapshot, ...stored };
      }
    } catch {
      // Use in-memory data.
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
    updatedAt: nowEpoch(),
  };
  publish({});
}
