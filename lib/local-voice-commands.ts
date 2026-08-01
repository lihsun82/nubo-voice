"use client";

import {
  isNuboMobileRuntime,
  launchNuboPhoneActionV2,
  resolveNuboPhoneActionV2,
} from "@/lib/nubo-phone-agent-v2";

const NUBO_SILENT_STORAGE_KEY = "nubo_silent_until_wake";
const NUBO_TOKEN_STANDBY_STORAGE_KEY = "nubo_token_saver_standby_v1";

function readNumber(text: string, fallback = 10) {
  const match = text.match(/(\d{1,3})/);
  if (!match) return fallback;
  return Math.max(0, Math.min(100, Number(match[1])));
}

async function postSetting(url: string, action: string, value = 10) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, value }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "設定失敗");
  return result;
}

async function postJson(
  url: string,
  body: Record<string, unknown> = {},
) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "操作失敗");
  return result;
}

function isWakePhrase(text: string) {
  return (
    text === "nubo" ||
    text === "努寶" ||
    text === "努宝" ||
    text === "兄弟" ||
    text === "有人嗎" ||
    text === "有人吗" ||
    text.includes("嗨nubo") ||
    text.includes("hanubo") ||
    text.includes("heynubo") ||
    text.includes("叫nubo出來") ||
    text.includes("喚醒nubo") ||
    text.includes("打開nubo") ||
    text.includes("nubo出來") ||
    text.includes("nubo跳出來")
  );
}

function isStandbyPhrase(text: string) {
  return (
    text.includes("閉嘴") ||
    text.includes("闭嘴") ||
    text.includes("安靜") ||
    text.includes("安静") ||
    text.includes("退下") ||
    text.includes("不要講話") ||
    text.includes("不要说话") ||
    text.includes("停止說話") ||
    text.includes("停止说话")
  );
}

function enterTokenSaverStandby() {
  window.localStorage.setItem(
    NUBO_SILENT_STORAGE_KEY,
    "true",
  );
  window.localStorage.setItem(
    NUBO_TOKEN_STANDBY_STORAGE_KEY,
    "true",
  );
  window.speechSynthesis?.cancel();
  document
    .querySelectorAll<HTMLAudioElement>("audio")
    .forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  window.dispatchEvent(
    new CustomEvent("nubo-token-saver-idle", {
      detail: { reason: "voice-command" },
    }),
  );
}

function hasMobileLaunchIntent(text: string) {
  return (
    /(開啟|打开|打開|啟動|启动|前往|進入|进入|切到|幫我開|帮我开)/.test(
      text,
    ) ||
    /(播放|搜尋|搜索).*(youtube|yt|油管|youtube音樂|youtubemusic)/.test(
      text,
    )
  );
}

function resolveMobileVoiceTarget(text: string) {
  if (!hasMobileLaunchIntent(text)) return null;

  if (
    text.includes("youtube音樂") ||
    text.includes("youtubemusic") ||
    text.includes("ytmusic")
  ) {
    return { app: "youtube_music", query: "" };
  }

  if (
    text.includes("facebook") ||
    text.includes("臉書") ||
    /(^|[^a-z])fb([^a-z]|$)/i.test(text)
  ) {
    return { app: "facebook", query: "" };
  }

  if (
    text.includes("instagram") ||
    /(^|[^a-z])ig([^a-z]|$)/i.test(text)
  ) {
    return { app: "instagram", query: "" };
  }

  if (
    text.includes("youtube") ||
    text.includes("油管") ||
    /(^|[^a-z])yt([^a-z]|$)/i.test(text)
  ) {
    return { app: "youtube", query: "" };
  }

  if (
    text.includes("google地圖") ||
    text.includes("googlemaps") ||
    text.includes("地圖") ||
    text.includes("導航")
  ) {
    return { app: "maps", query: "" };
  }

  if (text.includes("gmail")) {
    return { app: "gmail", query: "" };
  }

  if (text.includes("spotify")) {
    return { app: "spotify", query: "" };
  }

  if (text.includes("line") || text.includes("賴")) {
    return { app: "line", query: "" };
  }

  return null;
}

function runMobileLaunchCommand(normalized: string) {
  if (!isNuboMobileRuntime()) return null;

  const target = resolveMobileVoiceTarget(normalized);
  if (!target) return null;

  const action = resolveNuboPhoneActionV2(
    target.app,
    target.query,
  );
  const result = launchNuboPhoneActionV2(action);

  return {
    handled: true as const,
    type: "phone-agent-v2",
    result,
  };
}

export async function runLocalVoiceCommand(text: string) {
  const normalized = text.replace(/\s+/g, "").toLowerCase();

  if (isStandbyPhrase(normalized)) {
    enterTokenSaverStandby();
    return {
      handled: true,
      type: "token-saver-standby",
      result: {
        ok: true,
        message:
          "NUBO已關閉Gemini收音並進入省Token待命。",
      },
    };
  }

  if (isWakePhrase(normalized)) {
    window.localStorage.removeItem(
      NUBO_SILENT_STORAGE_KEY,
    );
    window.localStorage.removeItem(
      NUBO_TOKEN_STANDBY_STORAGE_KEY,
    );
    return {
      handled: true,
      type: "nubo",
      result: await postJson("/api/system/show-nubo"),
    };
  }

  const mobileLaunch = runMobileLaunchCommand(normalized);
  if (mobileLaunch) return mobileLaunch;

  if (
    normalized.includes("解除靜音") ||
    normalized.includes("取消靜音")
  ) {
    return {
      handled: true,
      type: "audio",
      result: await postSetting(
        "/api/device/audio",
        "unmute",
      ),
    };
  }

  if (normalized.includes("靜音")) {
    return {
      handled: true,
      type: "audio",
      result: await postSetting(
        "/api/device/audio",
        "mute",
      ),
    };
  }

  if (
    normalized.includes("音量調到") ||
    normalized.includes("音量設為") ||
    normalized.includes("聲音調到")
  ) {
    return {
      handled: true,
      type: "audio",
      result: await postSetting(
        "/api/device/audio",
        "set",
        readNumber(normalized, 50),
      ),
    };
  }

  if (
    normalized.includes("增加音量") ||
    normalized.includes("音量大一點") ||
    normalized.includes("大聲一點")
  ) {
    return {
      handled: true,
      type: "audio",
      result: await postSetting(
        "/api/device/audio",
        "increase",
        readNumber(normalized),
      ),
    };
  }

  if (
    normalized.includes("降低音量") ||
    normalized.includes("音量小一點") ||
    normalized.includes("小聲一點")
  ) {
    return {
      handled: true,
      type: "audio",
      result: await postSetting(
        "/api/device/audio",
        "decrease",
        readNumber(normalized),
      ),
    };
  }

  if (
    normalized.includes("亮度調到") ||
    normalized.includes("亮度設為") ||
    normalized.includes("螢幕亮度調到")
  ) {
    return {
      handled: true,
      type: "brightness",
      result: await postSetting(
        "/api/device/brightness",
        "set",
        readNumber(normalized, 50),
      ),
    };
  }

  if (
    normalized.includes("增加亮度") ||
    normalized.includes("亮一點") ||
    normalized.includes("螢幕亮一點")
  ) {
    return {
      handled: true,
      type: "brightness",
      result: await postSetting(
        "/api/device/brightness",
        "increase",
        readNumber(normalized),
      ),
    };
  }

  if (
    normalized.includes("降低亮度") ||
    normalized.includes("暗一點") ||
    normalized.includes("螢幕暗一點")
  ) {
    return {
      handled: true,
      type: "brightness",
      result: await postSetting(
        "/api/device/brightness",
        "decrease",
        readNumber(normalized),
      ),
    };
  }

  return { handled: false };
}
