"use client";

import { useEffect } from "react";
import {
  isNuboMobileRuntime,
  launchNuboPhoneActionV2,
  resolveNuboPhoneActionV2,
  resolveWebsiteTargetAsPhoneApp,
} from "@/lib/nubo-phone-agent-v2";

type PhoneCommand = {
  app: string;
  query?: string;
  value?: string;
};

const COMMAND_DEDUP_MS = 2_500;
let lastCommand = "";
let lastCommandAt = 0;

function normalizeCommand(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s　，。！？、,.!?]/g, "");
}

function stripCommandPrefix(text: string, pattern: RegExp) {
  const stripped = text.replace(pattern, "").trim();
  return stripped === text.trim() ? "" : stripped;
}

function parsePhoneCommand(text: string): PhoneCommand | null {
  const normalized = normalizeCommand(text);
  const wantsOpen = /(打開|開啟|啟動|幫我開|幫我打開|我要開|進入)/.test(
    normalized,
  );

  if (wantsOpen && /(line|賴)/i.test(normalized)) {
    return { app: "line" };
  }

  if (wantsOpen && /(facebook|fb|臉書)/i.test(normalized)) {
    return { app: "facebook" };
  }

  if (wantsOpen && /(instagram|ig)/i.test(normalized)) {
    return { app: "instagram" };
  }

  if (
    /(導航|帶我去|怎麼走|開地圖|打開地圖|開啟地圖|googlemaps|google地圖)/i.test(
      normalized,
    )
  ) {
    return {
      app: "maps",
      query: stripCommandPrefix(
        text,
        /^.*?(導航到|導航去|帶我去|怎麼走到|怎麼走去|在地圖搜尋|地圖搜尋|開地圖到|打開地圖到|開啟地圖到)/i,
      ),
    };
  }

  if (
    /(youtubemusic|youtube音樂)/i.test(normalized) &&
    (wantsOpen || /(播放|搜尋)/.test(normalized))
  ) {
    return {
      app: "youtube_music",
      query: stripCommandPrefix(
        text,
        /^.*?(用youtube music播放|youtube music播放|youtube音樂播放|播放|打開youtube music|開啟youtube music|打開youtube音樂|開啟youtube音樂)/i,
      ),
    };
  }

  if (
    /(youtube|油管)/i.test(normalized) &&
    (wantsOpen || /(播放|看|搜尋)/.test(normalized))
  ) {
    return {
      app: "youtube",
      query: stripCommandPrefix(
        text,
        /^.*?(用youtube播放|在youtube播放|youtube播放|播放|用youtube搜尋|youtube搜尋|打開youtube|開啟youtube|啟動youtube|打開油管|開啟油管)/i,
      ),
    };
  }

  if (
    /spotify/i.test(normalized) &&
    (wantsOpen || /(播放|搜尋)/.test(normalized))
  ) {
    return {
      app: "spotify",
      query: stripCommandPrefix(
        text,
        /^.*?(用spotify播放|spotify播放|播放|打開spotify|開啟spotify|啟動spotify)/i,
      ),
    };
  }

  if (wantsOpen && /gmail/i.test(normalized)) {
    return { app: "gmail" };
  }

  if (wantsOpen && /(google|chrome|瀏覽器)/i.test(normalized)) {
    return { app: "google" };
  }

  return null;
}

async function readSocketJson(data: unknown) {
  try {
    if (typeof data === "string") return JSON.parse(data);
    if (data instanceof Blob) return JSON.parse(await data.text());
    if (data instanceof ArrayBuffer) {
      return JSON.parse(new TextDecoder().decode(data));
    }
    if (ArrayBuffer.isView(data)) {
      return JSON.parse(new TextDecoder().decode(data));
    }
  } catch {
    return null;
  }

  return null;
}

function launchFromTranscript(text: string) {
  const command = parsePhoneCommand(text);
  if (!command) return;

  const signature = `${command.app}:${command.query ?? ""}:${command.value ?? ""}`;
  const now = Date.now();

  if (
    signature === lastCommand &&
    now - lastCommandAt < COMMAND_DEDUP_MS
  ) {
    return;
  }

  lastCommand = signature;
  lastCommandAt = now;

  try {
    const action = resolveNuboPhoneActionV2(
      command.app,
      command.query,
      command.value,
    );
    launchNuboPhoneActionV2(action);
  } catch (cause) {
    console.warn("[NUBO Phone Agent V2] voice launch failed", cause);
  }
}

function mapUrlToPhoneAction(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl, window.location.href);
    const host = parsed.hostname.toLowerCase();

    if (host === "line.me" || host.endsWith(".line.me")) {
      return resolveNuboPhoneActionV2("line");
    }
    if (host.includes("facebook.com")) {
      return resolveNuboPhoneActionV2("facebook", parsed.toString());
    }
    if (host.includes("instagram.com")) {
      return resolveNuboPhoneActionV2("instagram", parsed.toString());
    }
    if (host.includes("music.youtube.com")) {
      return resolveNuboPhoneActionV2("youtube_music", parsed.toString());
    }
    if (host.includes("youtube.com") || host === "youtu.be") {
      return resolveNuboPhoneActionV2("youtube", parsed.toString());
    }
    if (host.includes("google.com") && parsed.pathname.includes("maps")) {
      return resolveNuboPhoneActionV2("maps", parsed.toString());
    }
    if (host.includes("mail.google.com")) {
      return resolveNuboPhoneActionV2("gmail");
    }
    if (host.includes("open.spotify.com")) {
      return resolveNuboPhoneActionV2("spotify", parsed.toString());
    }
  } catch {
    // App aliases such as FB, IG and LINE are handled below.
  }

  const direct = resolveWebsiteTargetAsPhoneApp(rawUrl);
  if (direct) {
    return resolveNuboPhoneActionV2(direct.app, direct.query);
  }

  return null;
}

export function NuboPhoneAgentV2Bridge() {
  useEffect(() => {
    if (!isNuboMobileRuntime()) return;

    const OriginalWebSocket = window.WebSocket;
    const PatchedWebSocket = new Proxy(OriginalWebSocket, {
      construct(target, argumentsList, newTarget) {
        const socket = Reflect.construct(
          target,
          argumentsList,
          newTarget,
        ) as WebSocket;

        socket.addEventListener("message", (event) => {
          void readSocketJson(event.data).then((payload) => {
            const text =
              payload?.serverContent?.inputTranscription?.text;
            if (typeof text === "string" && text.trim()) {
              launchFromTranscript(text.trim());
            }
          });
        });

        return socket;
      },
    }) as typeof WebSocket;

    window.WebSocket = PatchedWebSocket;

    const originalOpen = window.open.bind(window);

    const patchedOpen: typeof window.open = (
      url?: string | URL,
      target?: string,
      features?: string,
    ) => {
      const rawUrl =
        typeof url === "string"
          ? url
          : url?.toString() ?? "";
      const action = rawUrl
        ? mapUrlToPhoneAction(rawUrl)
        : null;

      if (action) {
        launchNuboPhoneActionV2(action);
        return window;
      }

      return originalOpen(url, target, features);
    };

    window.open = patchedOpen;

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const action = mapUrlToPhoneAction(anchor.href);
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      launchNuboPhoneActionV2(action);
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      if (window.WebSocket === PatchedWebSocket) {
        window.WebSocket = OriginalWebSocket;
      }
      if (window.open === patchedOpen) {
        window.open = originalOpen;
      }
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}
