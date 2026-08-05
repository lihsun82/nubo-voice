"use client";

import { useEffect } from "react";
import { OpenAIRealtimeVoiceConsole } from "@/components/OpenAIRealtimeVoiceConsole";
import type { NuboVoiceProfile } from "@/lib/nubo-voice-profile";
import { readNuboVoiceTuning } from "@/lib/nubo-voice-tuning";

const OPENAI_REALTIME_CALL_URL = "https://api.openai.com/v1/realtime/calls";
const NUBO_REALTIME_PROXY_URL = "/api/realtime-token";

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

function normalizeSession(session: string) {
  if (!session.trim()) return "";

  try {
    const payload = JSON.parse(session) as Record<string, unknown>;
    const audio = asRecord(payload.audio);
    const output = asRecord(audio.output);
    output.speed = readNuboVoiceTuning().speed;
    audio.output = output;
    payload.audio = audio;
    payload.type = "realtime";
    payload.model = "gpt-realtime";
    return JSON.stringify(payload);
  } catch {
    throw new Error("高擬人語音設定格式不正確，請重新整理後再試。");
  }
}

function isHtmlResponse(contentType: string | null, body: string) {
  return Boolean(
    contentType?.includes("text/html") ||
      /^\s*<!doctype html/i.test(body) ||
      /^\s*<html/i.test(body),
  );
}

export function OpenAIRealtimeVoiceConsoleFixed({
  profile,
}: {
  profile: NuboVoiceProfile;
}) {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (
        url !== OPENAI_REALTIME_CALL_URL ||
        !(init?.body instanceof FormData)
      ) {
        return nativeFetch(input, init);
      }

      const originalForm = init.body;
      const sdp = await formValueToText(originalForm.get("sdp"));
      const session = normalizeSession(
        await formValueToText(originalForm.get("session")),
      );

      if (!sdp.trim()) {
        throw new Error("OpenAI Realtime SDP 建立失敗，請重新啟動 NUBO。");
      }

      const proxyForm = new FormData();
      proxyForm.append("sdp", sdp);
      if (session) proxyForm.append("session", session);

      const response = await nativeFetch(NUBO_REALTIME_PROXY_URL, {
        method: "POST",
        body: proxyForm,
        cache: "no-store",
      });

      if (response.ok) return response;

      const body = await response.text();
      const contentType = response.headers.get("content-type");

      if (isHtmlResponse(contentType, body)) {
        throw new Error("高擬人語音路由尚未就緒，請重新整理後再啟動 NUBO。");
      }

      try {
        const payload = JSON.parse(body) as {
          error?: unknown;
          code?: unknown;
        };
        if (typeof payload.error === "string" && payload.error.trim()) {
          const code =
            typeof payload.code === "string" && payload.code.trim()
              ? `（${payload.code.trim()}）`
              : "";
          throw new Error(`${payload.error.trim()}${code}`);
        }
      } catch (cause) {
        if (cause instanceof Error && cause.message !== "Unexpected end of JSON input") {
          throw cause;
        }
      }

      throw new Error("高擬人即時語音連線建立失敗，請稍後再試。");
    };

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);

  return <OpenAIRealtimeVoiceConsole profile={profile} />;
}
