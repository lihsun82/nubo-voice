"use client";

function volumeValue(text: string) {
  const match = text.match(/(?:音量|聲音).{0,8}?(\d{1,3})/);
  if (!match) return 10;
  return Math.max(0, Math.min(100, Number(match[1])));
}

async function postAudio(action: string, value = 10) {
  const response = await fetch("/api/device/audio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, value }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "音量調整失敗");
  return result;
}

export async function runLocalVoiceCommand(text: string) {
  const normalized = text.replace(/\s+/g, "").toLowerCase();

  if (normalized.includes("解除靜音") || normalized.includes("取消靜音")) {
    return { handled: true, result: await postAudio("unmute") };
  }

  if (normalized.includes("靜音")) {
    return { handled: true, result: await postAudio("mute") };
  }

  if (
    normalized.includes("音量調到") ||
    normalized.includes("音量設為") ||
    normalized.includes("聲音調到")
  ) {
    return {
      handled: true,
      result: await postAudio("set", volumeValue(normalized)),
    };
  }

  if (
    normalized.includes("增加音量") ||
    normalized.includes("音量大一點") ||
    normalized.includes("大聲一點")
  ) {
    return {
      handled: true,
      result: await postAudio("increase", volumeValue(normalized)),
    };
  }

  if (
    normalized.includes("降低音量") ||
    normalized.includes("音量小一點") ||
    normalized.includes("小聲一點")
  ) {
    return {
      handled: true,
      result: await postAudio("decrease", volumeValue(normalized)),
    };
  }

  return { handled: false };
}
