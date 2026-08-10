let pendingTranscript = "";
let debounceTimer: number | null = null;
let sending = false;
let lastSentTranscript = "";
let lastSentAt = 0;

const NAME_ALERT_DEBOUNCE_MS = 550;
const NAME_ALERT_DUPLICATE_MS = 8_000;

function normalizeTranscript(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "");
}

async function flushTranscript() {
  if (sending) return;

  const text = pendingTranscript.trim();
  pendingTranscript = "";
  if (!text) return;

  const normalized = normalizeTranscript(text);
  const now = Date.now();
  if (
    normalized === lastSentTranscript &&
    now - lastSentAt < NAME_ALERT_DUPLICATE_MS
  ) {
    return;
  }

  sending = true;
  try {
    await fetch("/api/notify/name-called", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript: text,
      }),
      keepalive: true,
    });
    lastSentTranscript = normalized;
    lastSentAt = Date.now();
  } catch (error) {
    console.warn("[name-alert] failed to send transcript", error);
  } finally {
    sending = false;

    if (pendingTranscript) {
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void flushTranscript();
      }, NAME_ALERT_DEBOUNCE_MS);
    }
  }
}

export async function sendTranscriptToNameAlert(
  transcript: string,
): Promise<void> {
  const text = transcript?.trim();
  if (!text || typeof window === "undefined") return;

  pendingTranscript = text;

  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void flushTranscript();
  }, NAME_ALERT_DEBOUNCE_MS);
}
