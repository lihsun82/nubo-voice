"use client";

import { controlGoogleHome } from "@/lib/google-home-native";

const VOICE_CHUNK_WINDOW_MS = 1800;
const COMMAND_DEDUPE_MS = 1400;
const MAX_COMMAND_BUFFER_LENGTH = 160;

let voiceCommandBuffer = "";
let lastVoiceChunkAt = 0;
let lastHandledSignature = "";
let lastHandledAt = 0;

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

function readGoogleHomeRoom(text: string) {
  const roomNumber = text.match(/(?:房間|房號)?(\d{2,4})(?:號)?房?/);
  if (roomNumber?.[1]) return roomNumber[1];

  const namedRoom = text.match(/(客廳|臥室|主臥|次臥|玄關|浴室|廚房|餐廳|書房|陽台)/);
  return namedRoom?.[1] ?? "";
}

function readLightAction(text: string): "on" | "off" | null {
  if (
    /(關燈|燈關掉|把燈關掉|關掉燈|關閉燈|關房間燈|熄燈|關一下燈|把燈關了)/.test(
      text,
    )
  ) {
    return "off";
  }

  if (
    /(開燈|燈打開|把燈打開|打開燈|開啟燈|開房間燈|開一下燈|把燈開了)/.test(
      text,
    )
  ) {
    return "on";
  }

  return null;
}

function mergeVoiceCommandChunk(text: string) {
  const now = Date.now();

  if (now - lastVoiceChunkAt > VOICE_CHUNK_WINDOW_MS) {
    voiceCommandBuffer = "";
  }
  lastVoiceChunkAt = now;

  if (!voiceCommandBuffer) {
    voiceCommandBuffer = text;
  } else if (text.includes(voiceCommandBuffer)) {
    // Some realtime engines resend the full cumulative transcript.
    voiceCommandBuffer = text;
  } else if (!voiceCommandBuffer.includes(text)) {
    // Other realtime engines emit transcript fragments such as 「開」→「燈」.
    voiceCommandBuffer += text;
  }

  if (voiceCommandBuffer.length > MAX_COMMAND_BUFFER_LENGTH) {
    voiceCommandBuffer = voiceCommandBuffer.slice(-MAX_COMMAND_BUFFER_LENGTH);
  }

  return voiceCommandBuffer;
}

function isDuplicateCommand(signature: string) {
  const now = Date.now();
  if (
    signature === lastHandledSignature &&
    now - lastHandledAt < COMMAND_DEDUPE_MS
  ) {
    return true;
  }

  lastHandledSignature = signature;
  lastHandledAt = now;
  return false;
}

export async function runLocalVoiceCommand(text: string) {
  const normalizedChunk = text.replace(/\s+/g, "").toLowerCase();
  const normalized = mergeVoiceCommandChunk(normalizedChunk);

  if (isWakePhrase(normalizedChunk)) {
    return { handled: true, type: "nubo", result: await postJson("/api/system/show-nubo") };
  }

  const lightAction = readLightAction(normalized);
  if (lightAction) {
    const room = readGoogleHomeRoom(normalized) || undefined;
    const signature = `google-home:${lightAction}:${room ?? "default"}`;

    if (isDuplicateCommand(signature)) {
      return {
        handled: true,
        type: "google-home",
        duplicate: true,
      };
    }

    const result = await controlGoogleHome({
      action: lightAction,
      room,
    });

    // A completed command should not leak into the next spoken turn.
    voiceCommandBuffer = "";

    return {
      handled: true,
      type: "google-home",
      result,
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
