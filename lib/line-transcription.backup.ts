import { getLineMessageContent } from "@/lib/line-messaging";

function extensionFor(contentType: string) {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  return "m4a";
}

export async function transcribeLineAudio(messageId: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "LINE語音控制需要OPENAI_API_KEY進行語音轉文字；目前尚未設定。",
    );
  }

  const { bytes, contentType } = await getLineMessageContent(messageId);
  const model =
    process.env.NUBO_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe";
  const form = new FormData();
  const blob = new Blob([bytes], { type: contentType });

  form.append("file", blob, `line-voice.${extensionFor(contentType)}`);
  form.append("model", model);
  form.append("response_format", "json");
  form.append("language", "zh");
  form.append(
    "prompt",
    "這是NUBO電腦遠端控制指令，常見詞彙包含：NUBO、LINE、YouTube、Gmail、Google、計算機、記事本、小畫家、檔案總管、音量、亮度、播放音樂、研究、查信。請以繁體中文忠實轉錄。",
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);

  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload?.error?.message ?? `語音轉文字失敗：${response.status}`,
      );
    }

    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!text) throw new Error("沒有辨識到可執行的語音內容，請再說一次。");
    return { text, model };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("LINE語音轉文字逾時，請縮短語音後再試。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
