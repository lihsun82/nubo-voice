"use client";

export type NuboVoicePhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export type YouTubePlayRequest = {
  videoId: string;
  title: string;
  channelTitle: string;
  query: string;
  watchUrl: string;
};

async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "NUBO動作執行失敗");
  return payload;
}

function post(url: string, body: Record<string, unknown>) {
  return requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function notifyNuboVoicePhase(phase: NuboVoicePhase) {
  window.dispatchEvent(
    new CustomEvent("nubo-voice-phase", { detail: { phase } }),
  );
}

export function primeBrowserActions() {
  notifyNuboVoicePhase("connecting");
  window.dispatchEvent(new CustomEvent("nubo-media-prime"));
  return true;
}

export async function playYouTubeInNubo(
  query: string,
  service: "youtube" | "youtube_music" = "youtube_music",
) {
  const result = (await post("/api/youtube/search", {
    query,
    service,
  })) as YouTubePlayRequest;

  window.dispatchEvent(
    new CustomEvent<YouTubePlayRequest>("nubo-youtube-play", {
      detail: result,
    }),
  );

  return {
    ok: true,
    playback: "nubo_media_dock",
    videoId: result.videoId,
    title: result.title,
    channelTitle: result.channelTitle,
    message: `已在NUBO播放器播放：${result.title}`,
  };
}

export async function openWebsiteInBrowser(target: string) {
  const result = (await post("/api/system/resolve-website", {
    target,
  })) as { url: string };

  window.setTimeout(() => {
    window.location.assign(result.url);
  }, 120);

  return {
    ok: true,
    opened: true,
    mode: "same_tab",
    url: result.url,
    message: `即將在目前分頁開啟：${result.url}`,
  };
}

export async function openDesktopTool(app: string) {
  return post("/api/system/open-app", { app });
}

export function installNuboActionFetchBridge() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(rawUrl, window.location.origin);

    if (
      url.origin === window.location.origin &&
      (url.pathname === "/api/youtube/open" ||
        url.pathname === "/api/system/open-website")
    ) {
      try {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const result =
          url.pathname === "/api/youtube/open"
            ? await playYouTubeInNubo(
                String(body.query ?? ""),
                body.service === "youtube" ? "youtube" : "youtube_music",
              )
            : await openWebsiteInBrowser(String(body.target ?? ""));
        return jsonResponse(result);
      } catch (error) {
        return jsonResponse(
          {
            error:
              error instanceof Error ? error.message : "NUBO瀏覽器動作失敗",
          },
          500,
        );
      }
    }

    return originalFetch(input, init);
  };

  return () => {
    window.fetch = originalFetch;
  };
}
