"use client";

import { useEffect } from "react";
import { OpenAIRealtimeVoiceConsole } from "@/components/OpenAIRealtimeVoiceConsole";
import type { NuboVoiceProfile } from "@/lib/nubo-voice-profile";

const REALTIME_CALL_URL = "https://api.openai.com/v1/realtime/calls";

async function formValueToText(value: FormDataEntryValue | null) {
  if (typeof value === "string") return value;
  if (value instanceof Blob) return value.text();
  return "";
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

      if (url !== REALTIME_CALL_URL || !(init?.body instanceof FormData)) {
        return nativeFetch(input, init);
      }

      const originalForm = init.body;
      const sdp = await formValueToText(originalForm.get("sdp"));
      const session = await formValueToText(originalForm.get("session"));

      if (!sdp.trim()) {
        throw new Error("OpenAI Realtime SDP 建立失敗，請重新啟動 NUBO。");
      }

      const fixedForm = new FormData();
      fixedForm.append("sdp", sdp);
      if (session.trim()) fixedForm.append("session", session);

      return nativeFetch(input, {
        ...init,
        body: fixedForm,
      });
    };

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);

  return <OpenAIRealtimeVoiceConsole profile={profile} />;
}
