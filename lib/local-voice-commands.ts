"use client";

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

function isWakePhrase(text: string) {
  return (
    text === "nubo" ||
    text === "努寶" ||
    text.includes("叫nubo出來") ||
    text.includes("喚醒nubo") ||
    text.includes("打開nubo") ||
    text.includes("nubo出來") ||
    text.includes("nubo跳出來")
  );
}

function dispatchVisionCommand(
  action:
    | "open"
    | "analyze"
    | "continuous"
    | "stop-continuous"
    | "switch"
    | "front"
    | "back"
    | "close",
) {
  window.dispatchEvent(
    new CustomEvent("nubo-vision-command", {
      detail: { action },
    }),
  );
  return {
    action,
    speechText:
      action === "analyze"
        ? "已請NUBO看一眼並分析畫面。"
        : action === "continuous"
          ? "已開啟持續觀察。"
          : action === "close"
            ? "鏡頭已關閉。"
            : "鏡頭指令已執行。",
  };
}

export async function runLocalVoiceCommand(text: string) {
  const normalized = text.replace(/\s+/g, "").toLowerCase();

  if (isWakePhrase(normalized)) {
    return { handled: true, type: "nubo", result: await postJson("/api/system/show-nubo") };
  }

  if (
    normalized.includes("關閉鏡頭") ||
    normalized.includes("關掉鏡頭") ||
    normalized.includes("關閉攝影機") ||
    normalized.includes("停止攝影")
  ) {
    return {
      handled: true,
      type: "vision",
      result: dispatchVisionCommand("close"),
    };
  }

  if (
    normalized.includes("停止觀察") ||
    normalized.includes("不要持續看")
  ) {
    return {
      handled: true,
      type: "vision",
      result: dispatchVisionCommand("stop-continuous"),
    };
  }

  if (
    normalized.includes("持續觀察") ||
    normalized.includes("一直看著") ||
    normalized.includes("持續看")
  ) {
    return {
      handled: true,
      type: "vision",
      result: dispatchVisionCommand("continuous"),
    };
  }

  if (
    normalized.includes("切換前鏡頭") ||
    normalized.includes("用前鏡頭") ||
    normalized.includes("開前鏡頭")
  ) {
    return {
      handled: true,
      type: "vision",
      result: dispatchVisionCommand("front"),
    };
  }

  if (
    normalized.includes("切換後鏡頭") ||
    normalized.includes("用後鏡頭") ||
    normalized.includes("開後鏡頭")
  ) {
    return {
      handled: true,
      type: "vision",
      result: dispatchVisionCommand("back"),
    };
  }

  if (
    normalized.includes("切換鏡頭") ||
    normalized.includes("換鏡頭")
  ) {
    return {
      handled: true,
      type: "vision",
      result: dispatchVisionCommand("switch"),
    };
  }

  if (
    normalized.includes("看一下這是什麼") ||
    normalized.includes("看一眼") ||
    normalized.includes("辨識這個") ||
    normalized.includes("眼前有什麼") ||
    normalized.includes("前面有什麼") ||
    normalized.includes("幫我看這是什麼")
  ) {
    return {
      handled: true,
      type: "vision",
      result: dispatchVisionCommand("analyze"),
    };
  }

  if (
    normalized.includes("開啟鏡頭") ||
    normalized.includes("打開鏡頭") ||
    normalized.includes("開攝影機") ||
    normalized.includes("開啟攝影機")
  ) {
    return {
      handled: true,
      type: "vision",
      result: dispatchVisionCommand("open"),
    };
  }

  if (normalized.includes("解除靜音") || normalized.includes("取消靜音")) {
    return { handled: true, type: "audio", result: await postSetting("/api/device/audio", "unmute") };
  }

  if (normalized.includes("靜音")) {
    return { handled: true, type: "audio", result: await postSetting("/api/device/audio", "mute") };
  }

  if (normalized.includes("音量調到") || normalized.includes("音量設為") || normalized.includes("聲音調到")) {
    return { handled: true, type: "audio", result: await postSetting("/api/device/audio", "set", readNumber(normalized, 50)) };
  }

  if (normalized.includes("增加音量") || normalized.includes("音量大一點") || normalized.includes("大聲一點")) {
    return { handled: true, type: "audio", result: await postSetting("/api/device/audio", "increase", readNumber(normalized)) };
  }

  if (normalized.includes("降低音量") || normalized.includes("音量小一點") || normalized.includes("小聲一點")) {
    return { handled: true, type: "audio", result: await postSetting("/api/device/audio", "decrease", readNumber(normalized)) };
  }

  if (normalized.includes("亮度調到") || normalized.includes("亮度設為") || normalized.includes("螢幕亮度調到")) {
    return { handled: true, type: "brightness", result: await postSetting("/api/device/brightness", "set", readNumber(normalized, 50)) };
  }

  if (normalized.includes("增加亮度") || normalized.includes("亮一點") || normalized.includes("螢幕亮一點")) {
    return { handled: true, type: "brightness", result: await postSetting("/api/device/brightness", "increase", readNumber(normalized)) };
  }

  if (normalized.includes("降低亮度") || normalized.includes("暗一點") || normalized.includes("螢幕暗一點")) {
    return { handled: true, type: "brightness", result: await postSetting("/api/device/brightness", "decrease", readNumber(normalized)) };
  }

  return { handled: false };
}
