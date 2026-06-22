"use client";

export type NuboVoicePhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

let webTab: Window | null = null;

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

function createWebTab() {
  if (webTab && !webTab.closed) return true;

  try {
    webTab = window.open("/web-ready", "nubo-web-tab");
    webTab?.blur();
    window.focus();
    return Boolean(webTab);
  } catch {
    webTab = null;
    return false;
  }
}

export function primeBrowserActions() {
  notifyNuboVoicePhase("connecting");
  createWebTab();
  return true;
}

export async function openWebsiteInBrowser(target: string) {
  const result = (await post("/api/system/resolve-website", {
    target,
  })) as { url: string };

  if (!webTab || webTab.closed) {
    const opened = createWebTab();
    if (!opened || !webTab) {
      throw new Error(
        "瀏覽器阻擋新分頁。請允許NUBO開啟分頁，重新按一次啟動NUBO後再試。",
      );
    }
  }

  webTab.location.href = result.url;
  webTab.focus();

  return {
    ok: true,
    opened: true,
    mode: "new_tab",
    url: result.url,
    message: `已在新分頁開啟：${result.url}`,
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

        if (url.pathname === "/api/youtube/open") {
          return jsonResponse({
            ok: false,
            disabled: true,
            message: "YouTube自動播放已停用，不會開啟任何YouTube視窗。",
          });
        }

        const result = await openWebsiteInBrowser(String(body.target ?? ""));
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
