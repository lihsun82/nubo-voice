import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_PCM_BASE64_CHARS = 900_000;
const MIN_PCM_BYTES = 16_000;
const DEFAULT_SAMPLE_RATE = 16_000;
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

type AudioDecision = {
  guestService: boolean;
  confidence: number;
  roomNumber: string;
  issue: string;
  urgency: "normal" | "high" | "critical";
};

function clampConfidence(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const cause = (error as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") return "";
  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

async function fetchWithTransientRetry(
  url: string | URL,
  init: RequestInit,
  timeoutMs: number,
  attempts = 3,
) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (attempt < attempts && TRANSIENT_STATUSES.has(response.status)) {
        await response.arrayBuffer().catch(() => undefined);
        console.warn("[guest-service-audio] transient HTTP retry", {
          attempt,
          status: response.status,
        });
        await sleep(350 * attempt);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) throw error;
      console.warn("[guest-service-audio] transient network retry", {
        attempt,
        code: fetchErrorCode(error) || null,
      });
      await sleep(350 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("fetch failed after retry");
}

function pcm16ToWav(pcm: Buffer, sampleRate: number) {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function readGeminiText(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseDecision(text: string): AudioDecision | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
  try {
    const payload = JSON.parse(cleaned);
    const urgency = payload?.urgency === "critical"
      ? "critical"
      : payload?.urgency === "high"
        ? "high"
        : "normal";
    return {
      guestService: payload?.guestService === true,
      confidence: clampConfidence(payload?.confidence),
      roomNumber: clean(payload?.roomNumber),
      issue: clean(payload?.issue),
      urgency,
    };
  } catch {
    return null;
  }
}

async function analyzeGuestAudio(wavBase64: string) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY 尚未設定");

  const model = (
    process.env.GEMINI_GUEST_AUDIO_MODEL ??
    process.env.GEMINI_TEXT_MODEL ??
    "gemini-3.5-flash"
  ).trim();

  const prompt = [
    "你是旅館客務語音分流器。請直接聽原始音訊，不要依賴任何外部逐字稿。",
    "判斷旅客是否正在提出需要旅館現場人員處理的需求，例如：送毛巾/浴巾/備品/水/枕頭、房務清潔、設備故障、噪音、遺失物、客訴、退款帳務、換房、叫車、緊急事件，或『送/拿/補/給某樣東西到某房』。",
    "只要語意明確是旅館客務，即使品項有一兩個字聽不清楚，也 guestService=true，issue 可寫『旅客要求送物到房間，品項語音不確定，請現場確認』，不要因此漏報。",
    "若只是聊天、查資料、播放音樂、打電話、一般手機控制、詢問日期時間，guestService=false。",
    "房號若聽到三零五、305、三樓五號房等，盡量正規化成最可能的房號；真的不確定可留空。",
    "只回 JSON，不要加任何說明。格式：",
    '{"guestService":true,"confidence":0.0,"roomNumber":"","issue":"","urgency":"normal"}',
  ].join("\n");

  const response = await fetchWithTransientRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        Connection: "close",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "audio/wav",
                  data: wavBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: "LOW" },
        },
      }),
    },
    30_000,
    3,
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ?? `Gemini raw-audio analysis failed: ${response.status}`,
    );
  }

  const text = readGeminiText(payload);
  const decision = parseDecision(text);
  if (!decision) throw new Error("客務原始音訊判斷回傳格式無效");
  return { decision, model };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const pcmBase64 = clean(body.pcmBase64);
    const sampleRateRaw = Number(body.sampleRate ?? DEFAULT_SAMPLE_RATE);
    const sampleRate = Number.isFinite(sampleRateRaw)
      ? Math.min(48_000, Math.max(8_000, Math.round(sampleRateRaw)))
      : DEFAULT_SAMPLE_RATE;

    if (!pcmBase64 || pcmBase64.length > MAX_PCM_BASE64_CHARS) {
      return NextResponse.json(
        { ok: false, analyzed: false, error: "原始音訊資料無效或過大" },
        { status: 400 },
      );
    }

    const pcm = Buffer.from(pcmBase64, "base64");
    if (pcm.length < MIN_PCM_BYTES) {
      return NextResponse.json({ ok: true, analyzed: false, reason: "audio-too-short" });
    }

    const wav = pcm16ToWav(pcm, sampleRate);
    const { decision, model } = await analyzeGuestAudio(wav.toString("base64"));

    console.info("[guest-service-audio] decision", {
      guestService: decision.guestService,
      confidence: decision.confidence,
      roomNumber: decision.roomNumber || null,
      urgency: decision.urgency,
      model,
    });

    if (!decision.guestService || decision.confidence < 0.55) {
      return NextResponse.json({
        ok: true,
        analyzed: true,
        sent: false,
        decision,
        model,
      });
    }

    const issue = decision.issue || "旅客提出需要現場人員處理的客務需求，請現場確認。";
    const port = clean(process.env.PORT) || "10000";
    const forwardUrl = `http://127.0.0.1:${port}/api/notify/guest-service`;
    const forwarded = await fetchWithTransientRetry(
      forwardUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomNumber: decision.roomNumber,
          issue,
          source: "raw-audio-semantic-second-pass-v2-internal-forward",
        }),
      },
      70_000,
      2,
    );
    const forwardedPayload = await forwarded.json().catch(() => ({}));

    if (!forwarded.ok) {
      throw new Error(
        forwardedPayload?.error ?? `客務通知轉送失敗：${forwarded.status}`,
      );
    }

    console.info("[guest-service-audio] delivered", {
      confidence: decision.confidence,
      roomNumber: decision.roomNumber || null,
      urgency: decision.urgency,
      model,
      forwardedInternally: true,
    });

    return NextResponse.json({
      ok: true,
      analyzed: true,
      sent: forwardedPayload?.sent === true,
      duplicate: forwardedPayload?.duplicate === true,
      decision,
      model,
    });
  } catch (error) {
    console.error("[guest-service-audio] failed", error);
    return NextResponse.json(
      {
        ok: false,
        analyzed: false,
        sent: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
