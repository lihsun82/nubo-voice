"use client";

import { useEffect } from "react";
import { appendNuboNativeLanguageInstruction } from "@/lib/nubo-native-language";

const OPENAI_REALTIME_CALL_URL = "https://api.openai.com/v1/realtime/calls";

async function formValueToText(value: FormDataEntryValue | null) {
  if (typeof value === "string") return value;
  if (value instanceof Blob) return value.text();
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function patchRealtimeSession(sessionText: string) {
  if (!sessionText.trim()) return sessionText;

  const payload = JSON.parse(sessionText) as Record<string, unknown>;
  const audio = asRecord(payload.audio);
  const input = asRecord(audio.input);
  const transcription = asRecord(input.transcription);

  // NUBO is a multilingual live assistant. Do not permanently lock the
  // asynchronous transcript helper to Chinese, otherwise Arabic/Finnish and
  // other language turns are biased toward zh recognition.
  if (Object.keys(transcription).length > 0) {
    delete transcription.language;
    transcription.prompt = "NUBO, AINUBO Hotel, Gmail, YouTube";
    input.transcription = transcription;
  }

  audio.input = input;
  payload.audio = audio;
  payload.instructions = appendNuboNativeLanguageInstruction(
    typeof payload.instructions === "string" ? payload.instructions : "",
  );

  return JSON.stringify(payload);
}

function patchGeminiSetup(data: string) {
  try {
    const payload = JSON.parse(data) as Record<string, unknown>;
    const setup = asRecord(payload.setup);
    if (!Object.keys(setup).length) return data;

    const systemInstruction = asRecord(setup.systemInstruction);
    const parts = Array.isArray(systemInstruction.parts)
      ? [...systemInstruction.parts]
      : [];

    let patched = false;
    const nextParts = parts.map((part) => {
      const item = asRecord(part);
      if (!patched && typeof item.text === "string") {
        patched = true;
        return {
          ...item,
          text: appendNuboNativeLanguageInstruction(item.text),
        };
      }
      return part;
    });

    if (!patched) {
      nextParts.push({ text: appendNuboNativeLanguageInstruction("") });
    }

    setup.systemInstruction = { ...systemInstruction, parts: nextParts };
    payload.setup = setup;
    return JSON.stringify(payload);
  } catch {
    return data;
  }
}

export function NuboMultilingualRuntime() {
  useEffect(() => {
    const previousFetch = window.fetch.bind(window);
    const previousWebSocketSend = WebSocket.prototype.send;

    const patchedFetch: typeof window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (
        url === OPENAI_REALTIME_CALL_URL &&
        init?.body instanceof FormData
      ) {
        const originalForm = init.body;
        const sessionText = await formValueToText(originalForm.get("session"));
        const nextForm = new FormData();

        originalForm.forEach((value, key) => {
          if (key === "session") return;
          if (typeof value === "string") nextForm.append(key, value);
          else nextForm.append(key, value, value.name);
        });

        if (sessionText.trim()) {
          nextForm.append(
            "session",
            new Blob([patchRealtimeSession(sessionText)], {
              type: "application/json",
            }),
            "session.json",
          );
        }

        return previousFetch(input, { ...init, body: nextForm });
      }

      return previousFetch(input, init);
    };

    window.fetch = patchedFetch;

    WebSocket.prototype.send = function patchedSend(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      if (typeof data === "string") {
        return Reflect.apply(previousWebSocketSend, this, [patchGeminiSetup(data)]);
      }
      return Reflect.apply(previousWebSocketSend, this, [data]);
    };

    return () => {
      if (window.fetch === patchedFetch) window.fetch = previousFetch;
      if (WebSocket.prototype.send !== previousWebSocketSend) {
        WebSocket.prototype.send = previousWebSocketSend;
      }
    };
  }, []);

  return null;
}
