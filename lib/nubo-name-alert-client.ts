let pendingTranscript = "";
let debounceTimer: number | null = null;
let sending = false;
let lastSentTranscript = "";
let lastSentAt = 0;

let guestPendingTranscript = "";
let guestDebounceTimer: number | null = null;
let guestSending = false;
let guestLastSentTranscript = "";
let guestLastSentAt = 0;

const NAME_ALERT_DEBOUNCE_MS = 550;
const NAME_ALERT_DUPLICATE_MS = 8_000;
const GUEST_ALERT_DEBOUNCE_MS = 1_200;
const GUEST_ALERT_DUPLICATE_MS = 90_000;

function normalizeTranscript(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "");
}

async function flushGuestServiceAlert() {
  if (guestSending) return;

  const text = guestPendingTranscript.trim();
  guestPendingTranscript = "";
  if (!text) return;

  const normalized = normalizeTranscript(text);
  const now = Date.now();
  if (
    normalized === guestLastSentTranscript &&
    now - guestLastSentAt < GUEST_ALERT_DUPLICATE_MS
  ) {
    return;
  }

  guestSending = true;
  try {
    await fetch("/api/notify/guest-service", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript: text,
      }),
      keepalive: true,
    });
    guestLastSentTranscript = normalized;
    guestLastSentAt = Date.now();
  } catch (error) {
    console.warn("[guest-service-alert] failed to send transcript", error);
  } finally {
    guestSending = false;

    if (guestPendingTranscript) {
      guestDebounceTimer = window.setTimeout(() => {
        guestDebounceTimer = null;
        void flushGuestServiceAlert();
      }, GUEST_ALERT_DEBOUNCE_MS);
    }
  }
}

function scheduleGuestServiceAlert(text: string) {
  guestPendingTranscript = text;

  if (guestDebounceTimer !== null) {
    window.clearTimeout(guestDebounceTimer);
  }

  guestDebounceTimer = window.setTimeout(() => {
    guestDebounceTimer = null;
    void flushGuestServiceAlert();
  }, GUEST_ALERT_DEBOUNCE_MS);
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

    /*
     * Gemini輸入轉錄會連續送出多個逐字更新。
     * 若傳送期間又收到較完整版本，只補送最新一筆。
     */
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

  /*
   * 客務升級通知與「被叫名字」通知共用既有轉錄入口，
   * 因此 Gemini / OpenAI Realtime 都會生效，不需要改動 LINE webhook。
   */
  scheduleGuestServiceAlert(text);

  pendingTranscript = text;

  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
  }

  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void flushTranscript();
  }, NAME_ALERT_DEBOUNCE_MS);
}
