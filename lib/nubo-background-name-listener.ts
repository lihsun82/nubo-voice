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
  "美樂",
  "美洛",

  // 通用稱呼
  "老闆",
  "老板",
  "老大",
  "Leo",
  "兄弟",
];

function normalizeText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/，/g, ",")
    .replace(/。/g, "")
    .replace(/！/g, "")
    .replace(/!/g, "")
    .replace(/？/g, "")
    .replace(/\?/g, "");
}

export function isNuboNameAlertText(transcript: string): boolean {
  const normalized = normalizeText(transcript).toLowerCase();

  return LOCAL_NAME_KEYWORDS.some((keyword) =>
    normalized.includes(normalizeText(keyword).toLowerCase()),
  );
}

let lastSentText = "";
let lastSentAt = 0;

async function sendBackgroundTranscript(transcript: string): Promise<void> {
  const text = transcript.trim();
  if (!text) return;

  window.dispatchEvent(new CustomEvent("nubo-background-name-transcript", {
    detail: { transcript: text },
  }));

  console.log("[name-alert/background] transcript:", text);

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

  const userAgent = window.navigator.userAgent;
  const isIpadOs =
    /Macintosh/i.test(userAgent) &&
    window.navigator.maxTouchPoints > 1;

  const isMobileBrowser =
    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||
    isIpadOs;

  if (isMobileBrowser) {
    console.log(
      "[name-alert/background] disabled on mobile to avoid recognition restart chime",
    );
    return () => {};
  }

  if (window.__nuboBackgroundNameListenerStop) {
    console.log("[name-alert/background] listener already running");
    return window.__nuboBackgroundNameListenerStop;
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn("[name-alert/background] this browser does not support SpeechRecognition");
    return () => {};
  }

  let stopped = false;
  let restartTimer: number | null = null;

  const recognition = new SpeechRecognition();

  recognition.lang = "zh-TW";
  recognition.continuous = true;

  // 重要：兩個字名字常常只出現在 interim，不能只等 final。
  recognition.interimResults = true;

  recognition.maxAlternatives = 1;

  const start = () => {
    if (stopped) return;

    try {
      recognition.start();
      console.log("[name-alert/background] listener started");
    } catch {
      // Chrome already started 時會丟錯，安全忽略。
    }
  };

  recognition.onresult = (event: SpeechRecognitionEventLike) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result?.[0]?.transcript?.trim();

      if (text) {
        void sendBackgroundTranscript(text);
      }
    }
  };

  recognition.onerror = (event: unknown) => {
    console.warn("[name-alert/background] recognition error", event);
  };

  recognition.onend = () => {
    if (stopped) return;

    restartTimer = window.setTimeout(() => {
      start();
    }, 600);
  };

  const stop = () => {
    stopped = true;

    if (restartTimer) {
      window.clearTimeout(restartTimer);
      restartTimer = null;
    }

    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;

    try {
      recognition.stop();
    } catch {}

    try {
      recognition.abort?.();
    } catch {}

    if (window.__nuboBackgroundNameListenerStop === stop) {
      window.__nuboBackgroundNameListenerStop = undefined;
    }

    console.log("[name-alert/background] listener stopped");
  };

  window.__nuboBackgroundNameListenerStop = stop;

  start();

  return stop;
}


