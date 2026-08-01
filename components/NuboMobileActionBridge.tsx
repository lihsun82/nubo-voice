"use client";

import { useEffect } from "react";

type JsonRecord = Record<string, unknown>;

function isMobileBrowser() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const coarsePointer = window
    .matchMedia("(pointer: coarse) and (max-width: 1100px)")
    .matches;

  return mobileUserAgent || coarsePointer;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function readBody(init?: RequestInit): JsonRecord {
  if (!init?.body || typeof init.body !== "string") return {};

  try {
    const parsed = JSON.parse(init.body) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : {};
  } catch {
    return {};
  }
}

function resolveMobileUrl(appValue: unknown, queryValue?: unknown) {
  const app = normalize(appValue);
  const query = String(queryValue ?? "").trim();

  if (["line", "賴"].includes(app)) {
    return { url: "https://line.me/R/nv/chat", label: "LINE" };
  }

  if (["facebook", "fb", "臉書"].includes(app)) {
    return { url: "https://www.facebook.com/", label: "Facebook" };
  }

  if (["instagram", "ig"].includes(app)) {
    return { url: "https://www.instagram.com/", label: "Instagram" };
  }

  if (["maps", "googlemaps", "地圖", "google地圖"].includes(app)) {
    return {
      url: query
        ? "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(query)
        : "https://www.google.com/maps/",
      label: "Google Maps",
    };
  }

  if (["youtube", "yt", "油管"].includes(app)) {
    return {
      url: query
        ? "https://www.youtube.com/results?search_query=" +
          encodeURIComponent(query)
        : "https://www.youtube.com/",
      label: "YouTube",
    };
  }

  if (["youtubemusic", "ytmusic", "youtube音樂"].includes(app)) {
    return {
      url: query
        ? "https://music.youtube.com/search?q=" + encodeURIComponent(query)
        : "https://music.youtube.com/",
      label: "YouTube Music",
    };
  }

  if (["google", "chrome", "瀏覽器"].includes(app)) {
    return {
      url: query
        ? "https://www.google.com/search?q=" + encodeURIComponent(query)
        : "https://www.google.com/",
      label: "Google",
    };
  }

  if (["gmail", "googlemail"].includes(app)) {
    return { url: "https://mail.google.com/", label: "Gmail" };
  }

  if (["calculator", "calc", "計算機", "計算器"].includes(app)) {
    return {
      url: window.location.origin + "/mobile-tools/calculator",
      label: "NUBO 計算機",
    };
  }

  return null;
}

function resolveWebsiteTarget(value: unknown) {
  const raw = String(value ?? "").trim();
  const mapped = resolveMobileUrl(raw);
  if (mapped) return mapped;

  if (/^https?:\/\//i.test(raw)) {
    return { url: raw, label: "網站" };
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) {
    return { url: "https://" + raw, label: "網站" };
  }

  return {
    url: "https://www.google.com/search?q=" + encodeURIComponent(raw),
    label: raw || "Google",
  };
}

function jsonResponse(payload: JsonRecord) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function NuboMobileActionBridge() {
  useEffect(() => {
    if (!isMobileBrowser()) return;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      let url: URL;
      try {
        url = new URL(rawUrl, window.location.origin);
      } catch {
        return originalFetch(input, init);
      }

      if (url.origin !== window.location.origin) {
        return originalFetch(input, init);
      }

      const body = readBody(init);

      if (url.pathname === "/api/youtube/open") {
        const service = body.service === "youtube" ? "youtube" : "youtube_music";
        const query = String(body.query ?? "").trim();
        const destination = resolveMobileUrl(service, query);

        if (destination) {
          return jsonResponse({
            ok: true,
            mobileUrl: destination.url,
            mobileLabel: destination.label,
            autoOpen: true,
            mobileOnly: true,
          });
        }
      }

      if (url.pathname === "/api/system/open-app") {
        if (String(body.action ?? "").toLowerCase() !== "close") {
          const destination = resolveMobileUrl(body.app, body.query);

          if (destination) {
            return jsonResponse({
              ok: true,
              mobileUrl: destination.url,
              mobileLabel: destination.label,
              autoOpen: true,
              mobileOnly: true,
            });
          }
        }
      }

      if (url.pathname === "/api/system/open-website") {
        const destination = resolveWebsiteTarget(body.target);

        return jsonResponse({
          ok: true,
          mobileUrl: destination.url,
          mobileLabel: destination.label,
          autoOpen: true,
          mobileOnly: true,
        });
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
