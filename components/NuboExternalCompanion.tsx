"use client";

import { useEffect } from "react";

const EXTERNAL_RETURN_KEY = "nubo_external_app_return_v1";
const AUTO_RESUME_KEY = "nubo_voice_auto_resume_v1";
const COMPANION_UNTIL_KEY = "nubo_external_companion_until_v1";
const COMPANION_WINDOW_MS = 10 * 60_000;

function readCompanionUntil() {
  const value = Number(
    window.localStorage.getItem(COMPANION_UNTIL_KEY) ?? "0",
  );
  return Number.isFinite(value) ? value : 0;
}

function externalActionPending() {
  return (
    window.localStorage.getItem(EXTERNAL_RETURN_KEY) === "true" ||
    window.localStorage.getItem(AUTO_RESUME_KEY) === "true"
  );
}

function findStartButton() {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) =>
    (button.textContent ?? "")
      .replace(/\s+/g, "")
      .includes("啟動NUBO"),
  );
}

/**
 * Best-effort Android/PWA companion mode.
 *
 * When NUBO opens another website/app, the current page normally becomes hidden.
 * This component keeps the 25-second token saver from immediately closing the
 * existing Gemini Live session and attempts to reconnect if Android suspends it.
 */
export function NuboExternalCompanion() {
  useEffect(() => {
    let expiryTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let foregroundCleanupTimer: number | null = null;
    let reconnectInProgress = false;

    const clearExpiryTimer = () => {
      if (!expiryTimer) return;
      window.clearTimeout(expiryTimer);
      expiryTimer = null;
    };

    const clearReconnectTimer = () => {
      if (!reconnectTimer) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const clearForegroundCleanupTimer = () => {
      if (!foregroundCleanupTimer) return;
      window.clearTimeout(foregroundCleanupTimer);
      foregroundCleanupTimer = null;
    };

    const isCompanionActive = () => Date.now() < readCompanionUntil();

    const expireCompanion = () => {
      clearExpiryTimer();
      window.localStorage.removeItem(COMPANION_UNTIL_KEY);

      if (document.visibilityState === "hidden") {
        window.dispatchEvent(
          new CustomEvent("nubo-token-saver-idle", {
            detail: { reason: "external-companion-expired" },
          }),
        );
      }
    };

    const armExpiryTimer = () => {
      clearExpiryTimer();
      const remaining = readCompanionUntil() - Date.now();
      if (remaining <= 0) {
        expireCompanion();
        return;
      }
      expiryTimer = window.setTimeout(expireCompanion, remaining);
    };

    const startCompanion = () => {
      clearForegroundCleanupTimer();
      const currentUntil = readCompanionUntil();
      const nextUntil = Math.max(
        currentUntil,
        Date.now() + COMPANION_WINDOW_MS,
      );
      window.localStorage.setItem(COMPANION_UNTIL_KEY, String(nextUntil));
      window.localStorage.setItem(AUTO_RESUME_KEY, "true");
      armExpiryTimer();
    };

    const attemptBackgroundReconnect = () => {
      clearReconnectTimer();
      if (
        document.visibilityState !== "hidden" ||
        !isCompanionActive() ||
        reconnectInProgress
      ) {
        return;
      }

      const button = findStartButton();
      if (!button || button.disabled) return;

      reconnectInProgress = true;
      button.click();
      window.setTimeout(() => {
        reconnectInProgress = false;
      }, 2500);
    };

    const scheduleBackgroundReconnect = () => {
      clearReconnectTimer();
      reconnectTimer = window.setTimeout(
        attemptBackgroundReconnect,
        450,
      );
    };

    const scheduleForegroundCleanup = () => {
      clearForegroundCleanupTimer();
      foregroundCleanupTimer = window.setTimeout(() => {
        if (document.visibilityState !== "visible") return;
        clearExpiryTimer();
        window.localStorage.removeItem(COMPANION_UNTIL_KEY);
      }, 2800);
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "hidden" &&
        externalActionPending()
      ) {
        startCompanion();
        scheduleBackgroundReconnect();
        return;
      }

      if (document.visibilityState === "visible") {
        /*
         * GeminiVoiceConsole先完成返回前景的自動續接，再恢復原本25秒
         * 省Token規則，避免回到NUBO後仍額外常駐10分鐘。
         */
        scheduleForegroundCleanup();
      }
    };

    const handleVoicePhase = (event: Event) => {
      const phase = (
        event as CustomEvent<{ phase?: string }>
      ).detail?.phase;

      if (
        document.visibilityState === "hidden" &&
        isCompanionActive() &&
        (phase === "idle" || phase === "error")
      ) {
        scheduleBackgroundReconnect();
      }
    };

    const blockTokenSaverDuringCompanion = (event: Event) => {
      if (
        isCompanionActive() ||
        (document.visibilityState === "hidden" && externalActionPending())
      ) {
        if (!isCompanionActive()) startCompanion();
        event.stopImmediatePropagation();
      }
    };

    const companionPoll = window.setInterval(() => {
      if (
        document.visibilityState === "hidden" &&
        externalActionPending() &&
        !isCompanionActive()
      ) {
        startCompanion();
      }

      if (
        document.visibilityState === "hidden" &&
        isCompanionActive()
      ) {
        attemptBackgroundReconnect();
      }
    }, 1500);

    window.addEventListener(
      "nubo-token-saver-idle",
      blockTokenSaverDuringCompanion,
      true,
    );
    window.addEventListener(
      "nubo-voice-phase",
      handleVoicePhase,
    );
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
      true,
    );

    if (isCompanionActive()) armExpiryTimer();

    return () => {
      clearExpiryTimer();
      clearReconnectTimer();
      clearForegroundCleanupTimer();
      window.clearInterval(companionPoll);
      window.removeEventListener(
        "nubo-token-saver-idle",
        blockTokenSaverDuringCompanion,
        true,
      );
      window.removeEventListener(
        "nubo-voice-phase",
        handleVoicePhase,
      );
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
        true,
      );
    };
  }, []);

  return null;
}
