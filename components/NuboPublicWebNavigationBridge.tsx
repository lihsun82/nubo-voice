"use client";

import { useEffect, useState } from "react";

const BUILD_ID = "public-web-navigation-v2-20260801";
const AUTO_RESUME_KEY = "nubo_voice_auto_resume_v1";
const EXTERNAL_RETURN_KEY = "nubo_external_app_return_v1";

type JsonRecord = Record<string, unknown>;

type PendingNavigation = {
  url: string;
  label: string;
};

function isPublicWebHost() {
  const hostname = window.location.hostname.toLowerCase();
  return ![
    "localhost",
    "127.0.0.1",
    "::1",
  ].includes(hostname);
}

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function resolveKnownTarget(
  appValue: unknown,
  queryValue?: unknown,
  valueValue?: unknown,
) {
  const app = normalizeKey(appValue);
  const query = String(queryValue ?? "").trim();
  const value = String(valueValue ?? "").trim();

  if (["facebook", "fb", "臉書"].includes(app)) {
    return { url: "https://m.facebook.com/", label: "Facebook" };
  }

  if (["instagram", "ig"].includes(app)) {
    return { url: "https://www.instagram.com/", label: "Instagram" };
  }

  if (["youtube", "yt", "油管"].includes(app)) {
    return {
      url: query
        ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
        : "https://www.youtube.com/",
      label: "YouTube",
    };
  }

  if (["youtubemusic", "ytmusic", "youtube音樂"].includes(app)) {
    return {
      url: query
        ? `https://music.youtube.com/search?q=${encodeURIComponent(query)}`
        : "https://music.youtube.com/",
      label: "YouTube Music",
    };
  }

  if (["maps", "googlemaps", "地圖", "google地圖"].includes(app)) {
    return {
      url: query
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
        : "https://www.google.com/maps/",
      label: "Google Maps",
    };
  }

  if (["gmail", "googlemail"].includes(app)) {
    return { url: "https://mail.google.com/", label: "Gmail" };
  }

  if (["google", "browser", "chrome", "瀏覽器"].includes(app)) {
    return {
      url: query
        ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
        : "https://www.google.com/",
      label: "Google",
    };
  }

  if (["line", "賴"].includes(app)) {
    return { url: "https://line.me/R/nv/chat", label: "LINE" };
  }

  if (["phone", "dialer", "電話", "撥號"].includes(app)) {
    const phone = value.replace(/[^+\d]/g, "");
    return { url: phone ? `tel:${phone}` : "tel:", label: "電話" };
  }

  if (["sms", "message", "簡訊", "訊息"].includes(app)) {
    const phone = value.replace(/[^+\d]/g, "");
    return { url: phone ? `sms:${phone}` : "sms:", label: "簡訊" };
  }

  if (["email", "mail", "電子郵件"].includes(app)) {
    return {
      url: value ? `mailto:${encodeURIComponent(value)}` : "mailto:",
      label: "Email",
    };
  }

  return null;
}

function resolveWebsiteTarget(value: unknown) {
  const raw = String(value ?? "").trim();
  const known = resolveKnownTarget(raw);
  if (known) return known;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.hostname === "www.facebook.com") {
        parsed.hostname = "m.facebook.com";
      }
      return { url: parsed.toString(), label: labelForUrl(parsed.toString()) };
    } catch {
      return null;
    }
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) {
    try {
      const parsed = new URL(`https://${raw}`);
      if (parsed.hostname === "www.facebook.com") {
        parsed.hostname = "m.facebook.com";
      }
      return { url: parsed.toString(), label: labelForUrl(parsed.toString()) };
    } catch {
      return null;
    }
  }

  if (!raw) return null;

  return {
    url: `https://www.google.com/search?q=${encodeURIComponent(raw)}`,
    label: raw,
  };
}

function labelForUrl(url: string) {
  if (/facebook\.com/i.test(url)) return "Facebook";
  if (/instagram\.com/i.test(url)) return "Instagram";
  if (/youtube\.com|youtu\.be/i.test(url)) return "YouTube";
  if (/google\.com\/maps/i.test(url)) return "Google Maps";
  if (/mail\.google\.com/i.test(url)) return "Gmail";
  if (/line\.me/i.test(url)) return "LINE";
  if (/^tel:/i.test(url)) return "電話";
  if (/^sms:/i.test(url)) return "簡訊";
  if (/^mailto:/i.test(url)) return "Email";
  return "外部網頁";
}

function normalizeExternalUrl(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  if (/^(tel|sms|mailto):/i.test(raw)) return raw;

  try {
    const parsed = new URL(raw, window.location.origin);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.origin === window.location.origin) return null;

    if (parsed.hostname === "www.facebook.com") {
      parsed.hostname = "m.facebook.com";
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

async function readRequestBody(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<JsonRecord> {
  if (typeof init?.body === "string") {
    try {
      const parsed = JSON.parse(init.body) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JsonRecord;
      }
    } catch {
      return {};
    }
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    try {
      const parsed = (await input.clone().json()) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as JsonRecord;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function jsonResponse(payload: JsonRecord, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-NUBO-Navigation": BUILD_ID,
    },
  });
}

export function NuboPublicWebNavigationBridge() {
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const [deploymentWarning, setDeploymentWarning] = useState("");

  useEffect(() => {
    if (!isPublicWebHost()) return;

    const originalOpen = window.open.bind(window);
    const originalFetch = window.fetch.bind(window);

    const navigate = (rawUrl: string, suppliedLabel?: string) => {
      const url = normalizeExternalUrl(rawUrl) ?? rawUrl;
      const label = suppliedLabel || labelForUrl(url);

      window.localStorage.setItem(AUTO_RESUME_KEY, "true");
      window.localStorage.setItem(EXTERNAL_RETURN_KEY, "true");
      setPending({ url, label });

      try {
        window.location.assign(url);
      } catch {
        setPending({ url, label });
      }
    };

    const publicOpen: typeof window.open = ((
      url?: string | URL,
      target?: string,
      features?: string,
    ) => {
      const raw = typeof url === "string" ? url : url?.toString() ?? "";
      const externalUrl = normalizeExternalUrl(raw);

      if (!externalUrl) {
        return originalOpen(url, target, features);
      }

      navigate(externalUrl);

      // 回傳null，讓既有程式繼續執行同頁導向備援，不會誤判新分頁成功。
      return null;
    }) as typeof window.open;

    window.open = publicOpen;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl =
        typeof input === "string"
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

      if (requestUrl.origin !== window.location.origin) {
        return originalFetch(input, init);
      }

      if (requestUrl.pathname === "/api/system/open-website") {
        const body = await readRequestBody(input, init);
        const destination = resolveWebsiteTarget(body.target);

        if (destination) {
          return jsonResponse({
            ok: true,
            mobileUrl: destination.url,
            mobileLabel: destination.label,
            autoOpen: true,
            publicWeb: true,
          });
        }
      }

      if (requestUrl.pathname === "/api/system/open-app") {
        const body = await readRequestBody(input, init);
        if (String(body.action ?? "").toLowerCase() !== "close") {
          const destination = resolveKnownTarget(
            body.app,
            body.query,
            body.value,
          );

          if (destination) {
            return jsonResponse({
              ok: true,
              mobileUrl: destination.url,
              mobileLabel: destination.label,
              autoOpen: true,
              publicWeb: true,
            });
          }
        }
      }

      if (requestUrl.pathname === "/api/youtube/open") {
        const response = await originalFetch(input, init);
        if (!response.ok) return response;

        try {
          const payload = (await response.clone().json()) as JsonRecord;
          const videoId =
            typeof payload.videoId === "string" ? payload.videoId.trim() : "";

          if (!videoId) return response;

          const body = await readRequestBody(input, init);
          const isYoutube = body.service === "youtube";
          const mobileUrl = isYoutube
            ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&autoplay=1`
            : `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

          return jsonResponse({
            ...payload,
            mobileUrl,
            mobileLabel: isYoutube ? "YouTube" : "YouTube Music",
            autoOpen: true,
            publicWeb: true,
          });
        } catch {
          return response;
        }
      }

      return originalFetch(input, init);
    };

    void originalFetch(`/api/health?ts=${Date.now()}`, {
      cache: "no-store",
      headers: { "X-NUBO-Health-Check": BUILD_ID },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = (await response.json()) as { build?: unknown };
        if (payload.build !== BUILD_ID) {
          setDeploymentWarning("NUBO網域目前載入的部署版本不一致，請重新整理頁面。");
        }
      })
      .catch(() => {
        setDeploymentWarning("NUBO網域健康檢查未通過，但外部網頁開啟備援仍已啟用。");
      });

    void navigator.serviceWorker
      ?.getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.update())),
      )
      .catch(() => undefined);

    return () => {
      if (window.open === publicOpen) {
        window.open = originalOpen;
      }
      window.fetch = originalFetch;
    };
  }, []);

  if (!pending && !deploymentWarning) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "max(12px, env(safe-area-inset-left))",
        right: "max(12px, env(safe-area-inset-right))",
        bottom: "max(14px, env(safe-area-inset-bottom))",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        border: "1px solid rgba(255,255,255,.18)",
        borderRadius: 16,
        background: "rgba(9,12,18,.97)",
        boxShadow: "0 16px 48px rgba(0,0,0,.45)",
        backdropFilter: "blur(18px)",
      }}
    >
      <span style={{ color: "#f6f7fb", fontSize: 14, lineHeight: 1.45 }}>
        {deploymentWarning ||
          `若手機沒有自動開啟${pending?.label ?? "外部網頁"}，請按右側按鈕。`}
      </span>
      {pending ? (
        <a
          href={pending.url}
          target="_self"
          rel="noreferrer"
          onClick={() => setPending(null)}
          style={{
            flex: "0 0 auto",
            padding: "9px 14px",
            borderRadius: 999,
            color: "#111",
            background: "linear-gradient(135deg, #f5c26b, #ff8a3d)",
            fontWeight: 750,
            textDecoration: "none",
          }}
        >
          開啟{pending.label}
        </a>
      ) : (
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            flex: "0 0 auto",
            padding: "9px 14px",
            border: 0,
            borderRadius: 999,
            color: "#111",
            background: "linear-gradient(135deg, #f5c26b, #ff8a3d)",
            fontWeight: 750,
            cursor: "pointer",
          }}
        >
          重新整理
        </button>
      )}
    </div>
  );
}
