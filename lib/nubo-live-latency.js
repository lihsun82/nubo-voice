"use client";

const EVENT_NAME = "nubo-live-latency-update";
const STORAGE_KEY = "nubo_live_latency_v1";
const GEMINI_SOCKET_PATTERN = /generativelanguage\.googleapis\.com\/ws\//i;

const emptySnapshot = {
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

let snapshot = { ...emptySnapshot };
let installed = false;
let sessionCounter = 0;
let originalFetch = null;
let originalSocketSend = null;
const instrumentedSockets = new WeakSet();

function now() {
  return Date.now();
}

function publish(patch = {}) {
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
    new CustomEvent(EVENT_NAME, {
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

function beginSession(openAt) {
  sessionCounter += 1;

  const tokenStartedAt = snapshot.tokenStartedAt;
  const tokenFinishedAt = snapshot.tokenFinishedAt;
  const tokenRoundTripMs = snapshot.tokenRoundTripMs;
  const tokenServerMs = snapshot.tokenServerMs;

  snapshot = {
    ...emptySnapshot,
    sessionId: sessionCounter,
    updatedAt: openAt,
    connectionStartedAt: tokenStartedAt || openAt,
    tokenStartedAt,
    tokenFinishedAt,
    tokenRoundTripMs,
    tokenServerMs,
    websocketCreatedAt: tokenFinishedAt || openAt,
    websocketOpenAt: openAt,
    websocketOpenMs:
      tokenFinishedAt === null
        ? null
        : Math.max(0, openAt - tokenFinishedAt),
  };
  publish();
}

function readFetchUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input?.url || "";
}

async function parseSocketPayload(data) {
  try {
    let text;
    if (typeof data === "string") text = data;
    else if (data instanceof Blob) text = await data.text();
    else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    else if (ArrayBuffer.isView(data)) text = new TextDecoder().decode(data);
    else return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function inspectServerMessage(message) {
  const receivedAt = now();

  if (message?.setupComplete !== undefined) {
    publish({
      setupCompleteAt: receivedAt,
      setupHandshakeMs:
        snapshot.setupSentAt === null
          ? null
          : Math.max(0, receivedAt - snapshot.setupSentAt),
    });
  }

  const functionCalls = message?.toolCall?.functionCalls;
  if (Array.isArray(functionCalls) && functionCalls.length > 0) {
    publish({
      toolCallAt: snapshot.toolCallAt || receivedAt,
      toolNames: functionCalls.map((item) =>
        typeof item?.name === "string" ? item.name : "未知工具",
      ),
    });
  }

  const serverContent = message?.serverContent;
  if (!serverContent || typeof serverContent !== "object") return;

  const userText = serverContent.inputTranscription?.text;
  if (typeof userText === "string" && userText.trim()) {
    if (snapshot.turnCompleteAt !== null) {
      resetTurnMetrics();
    }

    const transcriptAt = now();
    publish({
      userTranscriptFirstAt: snapshot.userTranscriptFirstAt || transcriptAt,
      userTranscriptLastAt: transcriptAt,
      lastUserText: userText.trim().slice(-240),
    });
  }

  const modelText = serverContent.outputTranscription?.text;
  if (typeof modelText === "string" && modelText.trim()) {
    publish({
      firstModelTextAt: snapshot.firstModelTextAt || now(),
    });
  }

  const parts = serverContent.modelTurn?.parts;
  if (Array.isArray(parts) && snapshot.firstModelAudioAt === null) {
    const hasAudio = parts.some(
      (part) =>
        typeof part?.inlineData?.data === "string" &&
        part.inlineData.data.length > 0,
    );

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

function attachSocketListeners(socket) {
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

function inspectClientMessage(socket, data) {
  if (typeof data !== "string") return;

  try {
    const message = JSON.parse(data);
    const sentAt = now();

    if (message?.setup !== undefined) {
      beginSession(sentAt);
      attachSocketListeners(socket);
      publish({ setupSentAt: sentAt });
    }

    if (message?.realtimeInput?.audio) {
      const firstPacket = snapshot.firstAudioUploadAt === null;
      publish({
        firstAudioUploadAt: snapshot.firstAudioUploadAt || sentAt,
        audioPacketCount: snapshot.audioPacketCount + 1,
        microphoneReadyAt: snapshot.microphoneReadyAt || sentAt,
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

    if (message?.toolResponse !== undefined) {
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

  window.fetch = async (...args) => {
    const url = readFetchUrl(args[0]);
    if (!url.includes("/api/gemini-token")) {
      return originalFetch(...args);
    }

    const startedAt = now();
    publish({ tokenStartedAt: startedAt });

    try {
      const response = await originalFetch(...args);
      const finishedAt = now();
      const payload = await response.clone().json().catch(() => ({}));

      publish({
        tokenFinishedAt: finishedAt,
        tokenRoundTripMs: Math.max(0, finishedAt - startedAt),
        tokenServerMs:
          typeof payload?.elapsedMs === "number" ? payload.elapsedMs : null,
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

  WebSocket.prototype.send = function sendWithLatencyProbe(data) {
    if (GEMINI_SOCKET_PATTERN.test(this.url)) {
      inspectClientMessage(this, data);
    }
    return originalSocketSend.call(this, data);
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
          ...JSON.parse(raw),
        };
      }
    } catch {
      // Use current in-memory data.
    }
  }
  return { ...snapshot };
}

export function subscribeNuboLiveLatency(listener) {
  if (typeof window === "undefined") return () => {};

  const handler = (event) => {
    listener(event.detail);
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
  publish();
}
