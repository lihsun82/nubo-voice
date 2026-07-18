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
  // 政勲 / 政勳
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

  // 玉娟
  "玉娟",
  "育娟",
  "玉捐",
  "育捐",
  "于娟",
  "余娟",
  "玉涓",
  "育涓",

  // 承裕
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

  // 品研
  "品研",
  "品妍",
  "品言",
  "品嚴",
  "品延",
  "品燕",

  // 耀鳴
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

  // 耀呈
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

  // 小魚
  "小魚",
  "小余",
  "小瑜",
  "小于",
  "曉魚",
  "曉瑜",

  // 魚均
  "魚均",
  "瑜君",
  "于君",
  "余君",
  "魚君",
  "于均",
  "余均",
  "瑜均",

  // 美樂
  "美樂",
  "美勒",
  "美了",
  "梅樂",
  "梅勒",
  "沒了",
  "美洛",

  // 通用稱呼
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

  /*
   * 喚醒詞只負責喚醒NUBO，不送名字通知，避免每次說「兄弟」都
   * 觸發LINE名字通知。
   */
  if (includesAny(text, WAKE_WORDS)) return;
  if (!isNuboNameAlertText(text)) return;

  const now = Date.now();
  const normalized = normalizeText(text);

  if (normalized === lastSentText && now - lastSentAt < 8000) {
    console.log("[name-alert/background] duplicated transcript skipped:", text);
    return;
  }

  lastSentText = normalized;
  lastSentAt = now;

  try {
    console.log("[name-alert/background] sending name alert:", text);

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
    console.warn("[name-alert/background] failed to send transcript", error);
  }
}

export function startNuboBackgroundNameListener(): () => void {
  if (typeof window === "undefined") return () => {};

  if (window.__nuboBackgroundNameListenerStop) {
    console.log("[name-alert/background] listener already running");
    return window.__nuboBackgroundNameListenerStop;
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn(
      "[name-alert/background] this browser does not support SpeechRecognition",
    );
    return () => {};
  }

  const userAgent = window.navigator.userAgent;
  const isIpadOs =
    /Macintosh/i.test(userAgent) &&
    window.navigator.maxTouchPoints > 1;
  const isMobileBrowser =
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    isIpadOs;

  let stopped = false;
  let recognitionRunning = false;
  let restartTimer: number | null = null;
  let currentPhase: NuboVoicePhase = "idle";

  const recognition = new SpeechRecognition();
  recognition.lang = "zh-TW";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  const shouldListenLocally = () =>
    !stopped &&
    document.visibilityState === "visible" &&
    (currentPhase === "idle" || currentPhase === "error");

  const clearRestartTimer = () => {
    if (!restartTimer) return;
    window.clearTimeout(restartTimer);
    restartTimer = null;
  };

  const stopRecognition = () => {
    clearRestartTimer();
    if (!recognitionRunning) return;
    recognitionRunning = false;

    try {
      recognition.stop();
    } catch {}

    try {
      recognition.abort?.();
    } catch {}
  };

  const startRecognition = () => {
    if (!shouldListenLocally() || recognitionRunning) return;

    try {
      recognition.start();
      recognitionRunning = true;
      console.log(
        "[name-alert/background] local wake listener started",
      );
    } catch (error) {
      console.warn(
        "[name-alert/background] local wake listener start failed",
        error,
      );
    }
  };

  const scheduleRestart = () => {
    clearRestartTimer();
    if (!shouldListenLocally()) return;

    restartTimer = window.setTimeout(
      startRecognition,
      isMobileBrowser ? 1200 : 600,
    );
  };

  const enterStandby = (reason: string) => {
    window.localStorage.setItem(
      NUBO_SILENT_STORAGE_KEY,
      "true",
    );
    window.localStorage.setItem(
      NUBO_TOKEN_STANDBY_STORAGE_KEY,
      "true",
    );
    dispatchBackgroundTranscript(reason);
    window.speechSynthesis?.cancel();
    document
      .querySelectorAll<HTMLAudioElement>("audio")
      .forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
    clickNuboButton("結束對話");
  };

  const wakeNubo = (text: string) => {
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
    }, 80);
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
    console.warn("[name-alert/background] recognition error", event);
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
      stopRecognition();
    }
  };

  const handleTokenSaverIdle = () => {
    enterStandby(
      "45秒沒有對話，NUBO已關閉Gemini收音並進入省Token待命。請說NUBO、兄弟或有人嗎重新喚醒。",
    );
  };

  const stop = () => {
    stopped = true;
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
      handleTokenSaverIdle,
    );
    document.removeEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    if (window.__nuboBackgroundNameListenerStop === stop) {
      window.__nuboBackgroundNameListenerStop = undefined;
    }

    console.log("[name-alert/background] listener stopped");
  };

  window.__nuboBackgroundNameListenerStop = stop;
  window.addEventListener(
    "nubo-voice-phase",
    handleVoicePhase,
  );
  window.addEventListener(
    "nubo-token-saver-idle",
    handleTokenSaverIdle,
  );
  document.addEventListener(
    "visibilitychange",
    handleVisibilityChange,
  );

  startRecognition();
  return stop;
}
