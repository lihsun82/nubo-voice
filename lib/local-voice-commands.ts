"use client";

const NUBO_SILENT_STORAGE_KEY = "nubo_silent_until_wake";
const NUBO_TOKEN_STANDBY_STORAGE_KEY = "nubo_token_saver_standby_v1";
const NUBO_AUTO_RESUME_STORAGE_KEY = "nubo_voice_auto_resume_v1";
const NUBO_EXTERNAL_RETURN_STORAGE_KEY = "nubo_external_app_return_v1";

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

async function postJson(url: string, body: Record<string, unknown> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "操作失敗");
  return result;
}

function isPublicNuboWeb() {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname.toLowerCase();
  return ![
    "localhost",
    "127.0.0.1",
    "::1",
  ].includes(hostname);
}

function extractYoutubeQuery(text: string) {
  return text
    .replace(/nubo/gi, " ")
    .replace(/努寶|努宝/gi, " ")
    .replace(/幫我|請|麻煩/gi, " ")
    .replace(/開啟|打開|啟動|前往|進入/gi, " ")
    .replace(/youtube\s*music|youtube|yt|油管/gi, " ")
    .replace(/網頁|網站|app|應用程式/gi, " ")
    .replace(/播放|搜尋|找/gi, " ")
    .replace(/[，。！？、,.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolvePublicWebCommand(text: string) {
  if (!isPublicNuboWeb()) return null;

  const normalized = text
    .replace(/\s+/g, "")
    .toLowerCase();

  const wantsOpen =
    normalized.includes("開啟") ||
    normalized.includes("打開") ||
    normalized.includes("啟動") ||
    normalized.includes("前往") ||
    normalized.includes("進入") ||
    normalized.includes("播放");

  if (!wantsOpen) return null;

  if (
    normalized.includes("facebook") ||
    normalized.includes("臉書") ||
    normalized.includes("脸书") ||
    /(^|[^a-z])fb([^a-z]|$)/i.test(text)
  ) {
    return {
      url: "https://m.facebook.com/",
      label: "Facebook",
    };
  }

  if (
    normalized.includes("instagram") ||
    /(^|[^a-z])ig([^a-z]|$)/i.test(text)
  ) {
    return {
      url: "https://www.instagram.com/",
      label: "Instagram",
    };
  }

  if (
    normalized.includes("youtube") ||
    normalized.includes("油管") ||
    /(^|[^a-z])yt([^a-z]|$)/i.test(text)
  ) {
    const query = normalized.includes("播放")
      ? extractYoutubeQuery(text)
      : "";

    return {
      url: query
        ? "https://www.youtube.com/results?search_query=" +
          encodeURIComponent(query)
        : "https://www.youtube.com/",
      label: "YouTube",
    };
  }

  return null;
}

function openPublicWebCommand(text: string) {
  const destination = resolvePublicWebCommand(text);
  if (!destination) return null;

  window.localStorage.setItem(
    NUBO_AUTO_RESUME_STORAGE_KEY,
    "true",
  );
  window.localStorage.setItem(
    NUBO_EXTERNAL_RETURN_STORAGE_KEY,
    "true",
  );

  /*
   * 這條路徑直接在手機目前分頁導向，不使用window.open，
   * 因此不受Chrome彈出式視窗與語音非同步事件限制。
   */
  window.location.assign(destination.url);

  return {
    handled: true,
    type: "public-web-navigation",
    result: {
      ok: true,
      url: destination.url,
      label: destination.label,
      mode: "same-tab",
    },
  };
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

  const publicWebCommand = openPublicWebCommand(text);
  if (publicWebCommand) {
    return publicWebCommand;
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

  if (normalized.includes("解除靜音") || normalized.includes("取消靜音")) {
    return {
      handled: true,
      type: "audio",
      result: await postSetting("/api/device/audio", "unmute"),
    };
  }

  if (normalized.includes("靜音")) {
    return {
      handled: true,
      type: "audio",
      result: await postSetting("/api/device/audio", "mute"),
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
