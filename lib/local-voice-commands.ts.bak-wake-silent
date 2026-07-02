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

export async function runLocalVoiceCommand(text: string) {
  const normalized = text.replace(/\s+/g, "").toLowerCase();

  if (isWakePhrase(normalized)) {
    return { handled: true, type: "nubo", result: await postJson("/api/system/show-nubo") };
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
