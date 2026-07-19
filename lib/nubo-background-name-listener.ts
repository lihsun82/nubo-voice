type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  [index: number]: {
    transcript: string;
  };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type NuboVoicePhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    __nuboBackgroundNameListenerStop?: () => void;
  }
}

const LOCAL_NAME_KEYWORDS = [
  "政勲",
  "政勳",
  "正勳",
  "正勲",
  "政興",
  "正興",
  "振興",
  "振勳",
  "振勲",
  "政熏",
  "正熏",
  "玉娟",
  "育娟",
  "玉捐",
  "育捐",
  "于娟",
  "余娟",
  "玉涓",
  "育涓",
  "承裕",
  "承育",
  "陳玉",
  "陳育",
  "成玉",
  "成育",
  "承玉",
  "誠裕",
  "誠育",
  "承諭",
  "晨玉",
  "晨育",
  "品研",
  "品妍",
  "品言",
  "品嚴",
  "品延",
  "品燕",
  "耀鳴",
  "耀明",
  "耀銘",
  "耀名",
  "要明",
  "要名",
  "要鳴",
  "要銘",
  "曜明",
  "曜鳴",
  "曜銘",
  "藥名",
  "要命",
  "耀呈",
  "耀成",
  "曜呈",
  "曜成",
  "要呈",
  "要成",
  "藥成",
  "藥呈",
  "右呈",
  "又成",
  "小魚",
  "小余",
  "小瑜",
  "小于",
  "曉魚",
  "曉瑜",
  "魚均",
  "瑜君",
  "于君",
  "余君",
  "魚君",
  "于均",
  "余均",
  "瑜均",
  "美樂",
  "美勒",
  "美了",
  "梅樂",
  "梅勒",
  "沒了",
  "美洛",
  "老闆",
  "老板",
  "老大",
  "Leo",
  "兄弟",
];

const WAKE_WORDS = [
  "嗨nubo",
  "嗨努寶",
  "嗨努宝",
  "hanubo",
  "heynubo",
  "nubo",
  "努寶",
  "努宝",
  "兄弟",
  "有人嗎",
  "有人吗",
];

const SILENCE_WORDS = [
  "閉嘴",
  "闭嘴",
  "安靜",
  "安静",
  "退下",
  "不要講話",
  "不要说话",
  "停止說話",
  "停止说话",
];

const NUBO_SILENT_STORAGE_KEY = "nubo_silent_until_wake";
const NUBO_TOKEN_STANDBY_STORAGE_KEY = "nubo_token_saver_standby_v1";

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/，/g, ",")
    .replace(/[。！!？?]/g, "");
}

function includesAny(text: string, words: string[]) {
  const normalized = normalizeText(text);
  return words.some((word) =>
    normalized.includes(normalizeText(word)),
  );
}

function isMobileBrowser() {
  const userAgent = window.navigator.userAgent;
  const isIpadOs =
    /Macintosh/i.test(userAgent) &&
    window.navigator.maxTouchPoints > 1;

  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    isIpadOs
  );
}

function dispatchBackgroundTranscript(transcript: string) {
  window.dispatchEvent(
    new CustomEvent("nubo-background-name-transcript", {
      detail: { transcript },
    }),
  );
}

function clickNuboButton(label: string) {
  const normalizedLabel = normalizeText(label);
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button"),
  ).find((candidate) =>
    normalizeText(candidate.textContent ?? "").includes(
      normalizedLabel,
    ),
  );

  if (!button || button.disabled) return false;
  button.click();
  return true;
}

function stopNuboOutput() {
  window.speechSynthesis?.cancel();
  document
    .querySelectorAll<HTMLAudioElement>("audio")
    .forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
}

export function isNuboNameAlertText(transcript: string): boolean {
  const normalized = normalizeText(transcript);
  return LOCAL_NAME_KEYWORDS.some((keyword) =>
    normalized.includes(normalizeText(keyword)),
  );
}

let lastSentText = "";
let lastSentAt = 0;

async function sendBackgroundTranscript(transcript: string): Promise<void> {
  const text = transcript.trim();
  if (!text) return;

  dispatchBackgroundTranscript(text);
  console.log("[name-alert/background] transcript:", text);

  if (includesAny(text, WAKE_WORDS)) return;
  if (!isNuboNameAlertText(text)) return;

  const now = Date.now();
  const normalized = normalizeText(text);

  if (normalized === lastSentText && now - lastSentAt < 8000) {
    console.log(
      "[name-alert/background] duplicated transcript skipped:",
      text,
    );
    return;
  }

  lastSentText = normalized;
  lastSentAt = now;

  try {
    await fetch("/api/notify/name-called", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript: text,
        source: "background-name-listener",
      }),
    });
  } catch (error) {
    console.warn(
      "[name-alert/background] failed to send transcript",
      error,
    );
  }
}

function startMobileSafeStandbyHandler(): () => void {
  const wasAutomaticStandby =
    window.localStorage.getItem(
      NUBO_TOKEN_STANDBY_STORAGE_KEY,
    ) === "true";

  window.localStorage.removeItem(
    NUBO_TOKEN_STANDBY_STORAGE_KEY,
  );

  if (wasAutomaticStandby) {
    window.localStorage.removeItem(NUBO_SILENT_STORAGE_KEY);
  }

  const handleTokenSaverIdle = () => {
    window.localStorage.removeItem(
      NUBO_TOKEN_STANDBY_STORAGE_KEY,
    );
    stopNuboOutput();
    clickNuboButton("結束對話");
    dispatchBackgroundTranscript(
      "NUBO已關閉收音並進入手機省電待命。請按啟動NUBO重新對話。",
    );
  };

  const stop = () => {
    window.removeEventListener(
      "nubo-token-saver-idle",
      handleTokenSaverIdle,
    );

    if (window.__nuboBackgroundNameListenerStop === stop) {
      window.__nuboBackgroundNameListenerStop = undefined;
    }
  };

  window.__nuboBackgroundNameListenerStop = stop;
  window.addEventListener(
    "nubo-token-saver-idle",
    handleTokenSaverIdle,
  );

  console.info(
    "[name-alert/background] mobile Web Speech wake listener disabled to prevent microphone toggle sounds",
  );

  return stop;
}

export function startNuboBackgroundNameListener(): () => void {
  if (typeof window === "undefined") return () => {};

  if (window.__nuboBackgroundNameListenerStop) {
    return window.__nuboBackgroundNameListenerStop;
  }

  /*
   * Android與iOS的Web Speech辨識會週期性結束並重新開啟麥克風，
   * 部分手機因此持續播放「嘟」聲。手機版完全停用這個第二麥克風，
   * 只保留Gemini Live單一收音；省Token後改由使用者按鈕重新啟動。
   */
  if (isMobileBrowser()) {
    return startMobileSafeStandbyHandler();
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn(
      "[name-alert/background] this browser does not support SpeechRecognition",
    );
    return () => {};
  }

  let stopped = false;
  let recognitionRunning = false;
  let restartTimer: number | null = null;
  let deferredStandbyTimer: number | null = null;
  let currentPhase: NuboVoicePhase = "idle";
  let permissionBlocked = false;

  const recognition = new SpeechRecognition();
  recognition.lang = "zh-TW";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  const isTokenSaverStandby = () =>
    window.localStorage.getItem(
      NUBO_TOKEN_STANDBY_STORAGE_KEY,
    ) === "true";

  const shouldListenLocally = () =>
    !stopped &&
    !permissionBlocked &&
    document.visibilityState === "visible" &&
    isTokenSaverStandby() &&
    (currentPhase === "idle" || currentPhase === "error");

  const clearRestartTimer = () => {
    if (!restartTimer) return;
    window.clearTimeout(restartTimer);
    restartTimer = null;
  };

  const clearDeferredStandby = () => {
    if (!deferredStandbyTimer) return;
    window.clearTimeout(deferredStandbyTimer);
    deferredStandbyTimer = null;
  };

  const stopRecognition = () => {
    clearRestartTimer();
    if (!recognitionRunning) return;
    recognitionRunning = false;

    try {
      recognition.abort?.();
    } catch {
      try {
        recognition.stop();
      } catch {}
    }
  };

  const startRecognition = () => {
    if (!shouldListenLocally() || recognitionRunning) return;

    try {
      recognition.start();
      recognitionRunning = true;
      console.log(
        "[name-alert/background] desktop wake listener started",
      );
    } catch (error) {
      recognitionRunning = false;
      console.warn(
        "[name-alert/background] local wake listener start failed",
        error,
      );
    }
  };

  const scheduleRestart = () => {
    clearRestartTimer();
    if (!shouldListenLocally()) return;

    restartTimer = window.setTimeout(startRecognition, 1500);
  };

  const enterStandby = (reason: string) => {
    clearDeferredStandby();
    window.localStorage.setItem(
      NUBO_SILENT_STORAGE_KEY,
      "true",
    );
    window.localStorage.setItem(
      NUBO_TOKEN_STANDBY_STORAGE_KEY,
      "true",
    );
    dispatchBackgroundTranscript(reason);
    stopNuboOutput();
    clickNuboButton("結束對話");
  };

  const wakeNubo = (text: string) => {
    clearDeferredStandby();
    window.localStorage.removeItem(NUBO_SILENT_STORAGE_KEY);
    window.localStorage.removeItem(
      NUBO_TOKEN_STANDBY_STORAGE_KEY,
    );
    dispatchBackgroundTranscript(text);
    stopRecognition();

    window.setTimeout(() => {
      if (!clickNuboButton("啟動NUBO")) {
        dispatchBackgroundTranscript(
          "已聽到喚醒詞，請按一下啟動NUBO。",
        );
      }
    }, 120);
  };

  const attemptAutomaticStandby = () => {
    clearDeferredStandby();

    if (
      currentPhase === "connecting" ||
      currentPhase === "thinking" ||
      currentPhase === "speaking"
    ) {
      deferredStandbyTimer = window.setTimeout(
        attemptAutomaticStandby,
        3000,
      );
      return;
    }

    enterStandby(
      "45秒沒有對話，NUBO已關閉Gemini收音並進入省Token待命。請說NUBO、兄弟或有人嗎重新喚醒。",
    );
  };

  recognition.onresult = (event: SpeechRecognitionEventLike) => {
    for (
      let index = event.resultIndex;
      index < event.results.length;
      index += 1
    ) {
      const result = event.results[index];
      const text = result?.[0]?.transcript?.trim();
      if (!text) continue;

      if (includesAny(text, SILENCE_WORDS)) {
        enterStandby(
          "NUBO已安靜並進入省Token待命。請說NUBO、兄弟或有人嗎重新喚醒。",
        );
        return;
      }

      if (includesAny(text, WAKE_WORDS)) {
        wakeNubo(text);
        return;
      }

      void sendBackgroundTranscript(text);
    }
  };

  recognition.onerror = (event: unknown) => {
    recognitionRunning = false;
    const errorCode =
      typeof event === "object" && event !== null && "error" in event
        ? String((event as { error?: unknown }).error ?? "")
        : "";

    if (
      errorCode === "not-allowed" ||
      errorCode === "service-not-allowed"
    ) {
      permissionBlocked = true;
      clearRestartTimer();
      console.warn(
        "[name-alert/background] microphone permission blocked; wake listener disabled",
      );
      return;
    }

    console.warn(
      "[name-alert/background] recognition error",
      event,
    );
    scheduleRestart();
  };

  recognition.onend = () => {
    recognitionRunning = false;
    scheduleRestart();
  };

  const handleVoicePhase = (event: Event) => {
    const customEvent = event as CustomEvent<{
      phase?: NuboVoicePhase;
    }>;
    const phase = customEvent.detail?.phase;
    if (!phase) return;

    currentPhase = phase;
    if (shouldListenLocally()) startRecognition();
    else stopRecognition();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      startRecognition();
    } else {
      clearDeferredStandby();
      stopRecognition();
    }
  };

  const handleSpeechActivity = () => {
    clearDeferredStandby();
  };

  const stop = () => {
    stopped = true;
    clearRestartTimer();
    clearDeferredStandby();
    stopRecognition();
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    window.removeEventListener(
      "nubo-voice-phase",
      handleVoicePhase,
    );
    window.removeEventListener(
      "nubo-token-saver-idle",
      attemptAutomaticStandby,
    );
    window.removeEventListener(
      "nubo-local-speech-activity",
      handleSpeechActivity,
    );
    document.removeEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    if (window.__nuboBackgroundNameListenerStop === stop) {
      window.__nuboBackgroundNameListenerStop = undefined;
    }
  };

  window.__nuboBackgroundNameListenerStop = stop;
  window.addEventListener(
    "nubo-voice-phase",
    handleVoicePhase,
  );
  window.addEventListener(
    "nubo-token-saver-idle",
    attemptAutomaticStandby,
  );
  window.addEventListener(
    "nubo-local-speech-activity",
    handleSpeechActivity,
  );
  document.addEventListener(
    "visibilitychange",
    handleVisibilityChange,
  );

  startRecognition();
  return stop;
}
