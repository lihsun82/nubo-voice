import fs from "node:fs";

const path = "components/GeminiVoiceConsole.tsx";
let source = fs.readFileSync(path, "utf8");

const MARKER = "NUBO_STABLE_1_2_BACKGROUND_CRASH_SAFE";
if (source.includes(MARKER)) {
  console.log("Stable 1.2 background web patch already applied");
  process.exit(0);
}

function replaceOnce(from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`Stable 1.2 web patch anchor missing: ${label}`);
  }
  source = source.replace(from, to);
}

replaceOnce(
`function includesVoiceCommand(text: string, words: string[]) {
  const normalized = normalizeVoiceCommandText(text);
  return words.some((word) => normalized.includes(normalizeVoiceCommandText(word)));
}
`,
`function includesVoiceCommand(text: string, words: string[]) {
  const normalized = normalizeVoiceCommandText(text);
  return words.some((word) => normalized.includes(normalizeVoiceCommandText(word)));
}

// ${MARKER}
function setNativeBackgroundVoiceMode(enabled: boolean) {
  try {
    const bridge = (window as typeof window & {
      NuboNative?: {
        setBackgroundVoiceEnabled?: (enabled: boolean) => boolean;
      };
    }).NuboNative;
    return bridge?.setBackgroundVoiceEnabled?.(enabled) === true;
  } catch {
    return false;
  }
}

function isNativeBackgroundVoiceModeActive() {
  try {
    const bridge = (window as typeof window & {
      NuboNative?: {
        isBackgroundVoiceModeActive?: () => boolean;
      };
    }).NuboNative;
    return bridge?.isBackgroundVoiceModeActive?.() === true;
  } catch {
    return false;
  }
}
`,
"native background helpers",
);

replaceOnce(
`    notifyNuboVoicePhase("idle");
    try {
      const bridge = (window as typeof window & {
        NuboNative?: { endExternalVoiceKeepAlive?: () => boolean };
      }).NuboNative;
      bridge?.endExternalVoiceKeepAlive?.();
    } catch {}
    startEcoWakeListener();
`,
`    notifyNuboVoicePhase("idle");
    setNativeBackgroundVoiceMode(false);
    try {
      const bridge = (window as typeof window & {
        NuboNative?: { endExternalVoiceKeepAlive?: () => boolean };
      }).NuboNative;
      bridge?.endExternalVoiceKeepAlive?.();
    } catch {}
    startEcoWakeListener();
`,
"eco sleep stops native background mode",
);

replaceOnce(
`    ecoSleepingRef.current = false;
    stopEcoWakeListener();
    clearReconnectTimer();
`,
`    ecoSleepingRef.current = false;
    stopEcoWakeListener();
    setNativeBackgroundVoiceMode(false);
    clearReconnectTimer();
`,
"disconnect stops native background mode",
);

replaceOnce(
`            setState("connected");
          }
`,
`            setState("connected");
            // Start Android microphone FGS only after Gemini + microphone are actually ready.
            // This avoids Android 14+ rejecting microphone FGS during Activity startup.
            setNativeBackgroundVoiceMode(true);
          }
`,
"arm native background only after connected",
);

replaceOnce(
`    if (
      typeof document !== "undefined" &&
      document.visibilityState ===
        "hidden"
    ) {
`,
`    if (
      typeof document !== "undefined" &&
      document.visibilityState ===
        "hidden" &&
      !isNativeBackgroundVoiceModeActive()
    ) {
`,
"allow reconnect while native background mode is active",
);

replaceOnce(
`      if (ecoSleepingRef.current || closingRef.current) return;
      const socket = socketRef.current;
`,
`      if (ecoSleepingRef.current || closingRef.current) return;
      // Background mode means the user intentionally wants NUBO to stay live.
      // Preserve the existing 30s eco rule only while the page is foregrounded.
      if (document.visibilityState === "hidden") return;
      const socket = socketRef.current;
`,
"suspend 30s eco while backgrounded",
);

fs.writeFileSync(path, source);
console.log("Applied Stable 1.2 web background crash-safe patch");
