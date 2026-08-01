"use client";

import { useEffect, useRef, useState } from "react";

const BUILD_ID = "public-web-navigation-v3-20260801";
const AUTO_RESUME_KEY = "nubo_voice_auto_resume_v1";
const EXTERNAL_RETURN_KEY = "nubo_external_app_return_v1";

type PendingNavigation = { url: string; label: string };
type JsonRecord = Record<string, unknown>;

function normalizeKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function knownDestination(value: unknown, queryValue?: unknown) {
  const key = normalizeKey(value);
  const query = String(queryValue ?? "").trim();

  if (["facebook", "fb", "臉書"].includes(key)) {
    return { url: "https://m.facebook.com/", label: "Facebook" };
  }
  if (["instagram", "ig"].includes(key)) {
    return { url: "https://www.instagram.com/", label: "Instagram" };
  }
  if (["youtube", "yt", "油管"].includes(key)) {
    return {
      url: query
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
        : "https://www.youtube.com/",
      label: "YouTube",
    };
  }
  if (["youtubemusic", "ytmusic", "youtube音樂"].includes(key)) {
    return {
      url: query
        ? `https://music.youtube.com/search?q=${encodeURIComponent(query)}`
        : "https://music.youtube.com/",
      label: "YouTube Music",
    };
  }
  if (["google", "chrome", "瀏覽器"].includes(key)) {
    return {
      url: query
        ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
        : "https://www.google.com/",
      label: "Google",
    };
  }
  if (["gmail", "googlemail"].includes(key)) {
    return { url: "https://mail.google.com/", label: "Gmail" };
  }
  if (["maps", "googlemaps", "地圖", "google地圖"].includes(key)) {
    return {
      url: query
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
        : "https://www.google.com/maps/",
      label: "Google Maps",
    };
  }
  if (["line", "賴"].includes(key)) {
    return { url: "https://line.me/R/nv/chat", label: "LINE" };
  }
  return null;
}

function destinationFromText(text: string) {
  const normalized = text.toLowerCase().replace(/[\s，。！？、:：…]+/g, "");
  const wantsOpen = /(開啟|打開|啟動|正在開啟|幫我開)/.test(normalized);
  if (!wantsOpen) return null;

  if (/(facebook|臉書|fb)/.test(normalized)) return knownDestination("facebook");
  if (/(instagram|ig)/.test(normalized)) return knownDestination("instagram");
  if (/(youtube|油管)/.test(normalized)) return knownDestination("youtube");
  if (/(gmail)/.test(normalized)) return knownDestination("gmail");
  if (/(googlemaps|google地圖|地圖)/.test(normalized)) return knownDestination("maps");
  return null;
}

function normalizeExternalUrl(rawValue: string) {
  const raw = rawValue.trim();
  if (!raw) return null;
  if (/^(tel|sms|mailto):/i.test(raw)) return raw;

  try {
    const parsed = new URL(raw, window.location.origin);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.origin === window.location.origin) return null;
    if (parsed.hostname === "www.facebook.com") parsed.hostname = "m.facebook.com";
    return parsed.toString();
  } catch {
    return null;
  }
}

function websiteDestination(value: unknown) {
  const raw = String(value ?? "").trim();
  const known = knownDestination(raw);
  if (known) return known;

  if (/^https?:\/\//i.test(raw)) {
    const url = normalizeExternalUrl(raw);
    return url ? { url, label: "外部網頁" } : null;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) {
    const url = normalizeExternalUrl(`https://${raw}`);
    return url ? { url, label: "外部網頁" } : null;
  }

  return raw
    ? { url: `https://www.google.com/search?q=${encodeURIComponent(raw)}`, label: raw }
    : null;
}

async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<JsonRecord> {
  if (typeof init?.body === "string") {
    try {
      const parsed = JSON.parse(init.body);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    try {
      const parsed = await input.clone().json();
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function jsonResponse(payload: JsonRecord) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-NUBO-Navigation": BUILD_ID,
    },
  });
}

export function NuboPublicWebNavigationBridge() {
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const [warning, setWarning] = useState("");
  const lastNavigationRef = useRef("");

  useEffect(() => {
    const hostname = window.location.hostname.toLowerCase();
    if (["localhost", "127.0.0.1", "::1"].includes(hostname)) return;

    const originalOpen = window.open.bind(window);
    const originalFetch = window.fetch.bind(window);

    const navigate = (rawUrl: string, label = "外部網頁") => {
      const url = normalizeExternalUrl(rawUrl) ?? rawUrl;
      const token = `${url}:${Math.floor(Date.now() / 3000)}`;
      if (lastNavigationRef.current === token) return;
      lastNavigationRef.current = token;

      window.localStorage.setItem(AUTO_RESUME_KEY, "true");
      window.localStorage.setItem(EXTERNAL_RETURN_KEY, "true");
      setPending({ url, label });

      // 手機語音工具屬於非同步事件，popup通常會被封鎖；直接同頁導向最可靠。
      window.location.href = url;
    };

    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const raw = typeof url === "string" ? url : url?.toString() ?? "";
      const external = normalizeExternalUrl(raw);
      if (!external) return originalOpen(url, target, features);
      navigate(external);
      return null;
    }) as typeof window.open;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      let requestUrl: URL;
      try {
        requestUrl = new URL(rawUrl, window.location.origin);
      } catch {
        return originalFetch(input, init);
      }

      if (requestUrl.origin === window.location.origin) {
        const body = await readBody(input, init);

        if (requestUrl.pathname === "/api/system/open-website") {
          const destination = websiteDestination(body.target);
          if (destination) {
            queueMicrotask(() => navigate(destination.url, destination.label));
            return jsonResponse({ ok: true, mobileUrl: destination.url, mobileLabel: destination.label, autoOpen: false, publicWeb: true });
          }
        }

        if (requestUrl.pathname === "/api/system/open-app" && String(body.action ?? "") !== "close") {
          const destination = knownDestination(body.app, body.query);
          if (destination) {
            queueMicrotask(() => navigate(destination.url, destination.label));
            return jsonResponse({ ok: true, mobileUrl: destination.url, mobileLabel: destination.label, autoOpen: false, publicWeb: true });
          }
        }
      }

      return originalFetch(input, init);
    };

    // 最後一道保險：監看畫面上的語音轉錄/工具狀態，不依賴Gemini是否選對工具。
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const text = mutation.target.textContent ?? "";
        const destination = destinationFromText(text);
        if (destination) {
          navigate(destination.url, destination.label);
          return;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    void originalFetch(`/api/health?ts=${Date.now()}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((health) => {
        if (health?.build !== BUILD_ID) {
          setWarning(`目前網域仍載入舊版：${String(health?.build ?? "unknown")}`);
        }
      })
      .catch(() => setWarning("無法確認網域部署版本"));

    return () => {
      window.open = originalOpen;
      window.fetch = originalFetch;
      observer.disconnect();
    };
  }, []);

  if (!pending && !warning) return null;

  return (
    <div style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 2147483647, display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 14, background: "rgba(8,10,22,.96)", border: "1px solid rgba(130,120,255,.45)", color: "white", boxShadow: "0 10px 34px rgba(0,0,0,.45)" }}>
      <span style={{ fontSize: 13 }}>{warning || `若未自動開啟${pending?.label ?? "網頁"}，請按右側。`}</span>
      {pending ? (
        <a href={pending.url} target="_blank" rel="noopener noreferrer" style={{ flex: "0 0 auto", padding: "8px 12px", borderRadius: 10, background: "linear-gradient(135deg,#59d8ff,#8c5cff)", color: "#07101b", fontWeight: 800, textDecoration: "none" }}>
          開啟{pending.label}
        </a>
      ) : null}
    </div>
  );
}
