"use client";

import { useEffect, useRef, useState } from "react";

const BUILD_ID = "mobile-web-open-v16-20260801";
const AUTO_RESUME_KEY = "nubo_voice_auto_resume_v1";
const EXTERNAL_RETURN_KEY = "nubo_external_app_return_v1";
const QUESTION_EVENT = "nubo-question-record";

type Destination = {
  key: string;
  url: string;
  label: string;
};

type PendingNavigation = Destination & {
  relayUrl: string;
};

const DESTINATIONS: Record<string, Destination> = {
  facebook: {
    key: "facebook",
    url: "https://m.facebook.com/",
    label: "Facebook",
  },
  instagram: {
    key: "instagram",
    url: "https://www.instagram.com/",
    label: "Instagram",
  },
  youtube: {
    key: "youtube",
    url: "https://www.youtube.com/",
    label: "YouTube",
  },
  gmail: {
    key: "gmail",
    url: "https://mail.google.com/",
    label: "Gmail",
  },
  maps: {
    key: "maps",
    url: "https://www.google.com/maps/",
    label: "Google Maps",
  },
  google: {
    key: "google",
    url: "https://www.google.com/",
    label: "Google",
  },
  line: {
    key: "line",
    url: "https://line.me/R/nv/chat",
    label: "LINE",
  },
};

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s　，。！？、：:；;（）()「」『』【】\[\]…]/g, "");
}

function destinationFromName(value: unknown) {
  const key = normalizeText(value).replace(/[_-]/g, "");

  if (["facebook", "fb", "臉書"].includes(key)) {
    return DESTINATIONS.facebook;
  }
  if (["instagram", "ig"].includes(key)) {
    return DESTINATIONS.instagram;
  }
  if (["youtube", "yt", "油管"].includes(key)) {
    return DESTINATIONS.youtube;
  }
  if (["gmail", "googlemail"].includes(key)) {
    return DESTINATIONS.gmail;
  }
  if (["maps", "googlemaps", "google地圖", "地圖"].includes(key)) {
    return DESTINATIONS.maps;
  }
  if (["google", "chrome", "browser", "瀏覽器"].includes(key)) {
    return DESTINATIONS.google;
  }
  if (["line", "賴"].includes(key)) {
    return DESTINATIONS.line;
  }

  return null;
}

function destinationFromUrl(rawValue: unknown) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw, window.location.origin);
    const host = parsed.hostname.toLowerCase();

    if (host.includes("facebook.com") || host === "fb.com") {
      return DESTINATIONS.facebook;
    }
    if (host.includes("instagram.com")) {
      return DESTINATIONS.instagram;
    }
    if (host.includes("youtube.com") || host === "youtu.be") {
      return DESTINATIONS.youtube;
    }
    if (host === "mail.google.com") {
      return DESTINATIONS.gmail;
    }
    if (host.includes("google.com") && parsed.pathname.includes("maps")) {
      return DESTINATIONS.maps;
    }
    if (host.includes("google.com")) {
      return DESTINATIONS.google;
    }
    if (host.includes("line.me")) {
      return DESTINATIONS.line;
    }

    if (["http:", "https:"].includes(parsed.protocol)) {
      return {
        key: "external",
        url: parsed.toString(),
        label: "網頁",
      };
    }
  } catch {
    return null;
  }

  return null;
}

function destinationFromCommand(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;

  const wantsOpen = /(開啟|打開|幫我開|替我開|啟動|進入|開facebook|開fb|開臉書|開instagram|開ig|開youtube)/.test(
    text,
  );

  if (!wantsOpen) return null;

  if (/(facebook|臉書|fb)/.test(text)) {
    return DESTINATIONS.facebook;
  }
  if (/(instagram|ig)/.test(text)) {
    return DESTINATIONS.instagram;
  }
  if (/(youtube|油管)/.test(text)) {
    return DESTINATIONS.youtube;
  }
  if (/gmail/.test(text)) {
    return DESTINATIONS.gmail;
  }
  if (/(googlemaps|google地圖|地圖)/.test(text)) {
    return DESTINATIONS.maps;
  }
  if (/(google|chrome|瀏覽器)/.test(text)) {
    return DESTINATIONS.google;
  }
  if (/(line|賴)/.test(text)) {
    return DESTINATIONS.line;
  }

  return null;
}

function buildRelayUrl(destination: Destination) {
  const relay = new URL("/open", window.location.origin);

  if (destination.key === "external") {
    relay.searchParams.set("url", destination.url);
  } else {
    relay.searchParams.set("target", destination.key);
  }

  relay.searchParams.set("build", BUILD_ID);
  relay.searchParams.set("ts", String(Date.now()));
  return relay.toString();
}

async function readRequestBody(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  if (typeof init?.body === "string") {
    try {
      return JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    try {
      const value = await input.clone().json();
      return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

function successResponse(destination: Destination) {
  return new Response(
    JSON.stringify({
      ok: true,
      opened: true,
      mobileUrl: destination.url,
      mobileLabel: destination.label,
      autoOpen: false,
      executionTarget: "client-browser",
      build: BUILD_ID,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-NUBO-Mobile-Open": BUILD_ID,
      },
    },
  );
}

export function NuboPublicWebNavigationBridge() {
  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const [warning, setWarning] = useState("");
  const lastNavigationRef = useRef("");

  useEffect(() => {
    const hostname = window.location.hostname.toLowerCase();
    const publicWeb = !["localhost", "127.0.0.1", "::1"].includes(hostname);

    if (!publicWeb) return;

    const originalOpen = window.open.bind(window);
    const originalFetch = window.fetch.bind(window);

    const navigate = (destination: Destination) => {
      const token = `${destination.key}:${Math.floor(Date.now() / 3000)}`;
      if (lastNavigationRef.current === token) return;
      lastNavigationRef.current = token;

      const relayUrl = buildRelayUrl(destination);

      window.localStorage.setItem(AUTO_RESUME_KEY, "true");
      window.localStorage.setItem(EXTERNAL_RETURN_KEY, "true");
      window.sessionStorage.setItem("nubo_mobile_open_build", BUILD_ID);

      setPending({ ...destination, relayUrl });
      setWarning("");

      window.setTimeout(() => {
        window.location.assign(relayUrl);
      }, 0);
    };

    const handleQuestion = (event: Event) => {
      const questionEvent = event as CustomEvent<{ text?: string }>;
      const destination = destinationFromCommand(questionEvent.detail?.text);

      if (destination) {
        navigate(destination);
      }
    };

    window.addEventListener(QUESTION_EVENT, handleQuestion);

    const wrappedFetch: typeof window.fetch = async (input, init) => {
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

      if (
        requestUrl.pathname === "/api/system/open-app" ||
        requestUrl.pathname === "/api/system/open-website"
      ) {
        const body = await readRequestBody(input, init);

        if (String(body.action ?? "open") !== "close") {
          const destination =
            requestUrl.pathname === "/api/system/open-app"
              ? destinationFromName(body.app)
              : destinationFromName(body.target) ||
                destinationFromUrl(body.target);

          if (destination) {
            queueMicrotask(() => navigate(destination));
            return successResponse(destination);
          }
        }
      }

      return originalFetch(input, init);
    };

    window.fetch = wrappedFetch;

    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const raw =
        typeof url === "string" ? url : url?.toString() ?? "";
      const destination = destinationFromUrl(raw);

      if (!destination) {
        return originalOpen(url, target, features);
      }

      navigate(destination);
      return window;
    }) as typeof window.open;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const node = mutation.target;

        if (
          node instanceof Element &&
          node.closest("[data-nubo-mobile-open-card='true']")
        ) {
          continue;
        }

        const destination = destinationFromCommand(node.textContent);
        if (destination) {
          navigate(destination);
          return;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    void originalFetch(`/api/health?ts=${Date.now()}`, {
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((health) => {
        if (health?.build !== BUILD_ID) {
          setWarning(
            `部署版本不一致：目前是 ${String(
              health?.build ?? "unknown",
            )}，需要 ${BUILD_ID}`,
          );
        }
      })
      .catch(() => {
        setWarning("無法讀取NUBO部署版本");
      });

    return () => {
      window.removeEventListener(QUESTION_EVENT, handleQuestion);
      if (window.fetch === wrappedFetch) {
        window.fetch = originalFetch;
      }
      window.open = originalOpen;
      observer.disconnect();
    };
  }, []);

  if (!pending && !warning) return null;

  return (
    <div
      data-nubo-mobile-open-card="true"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 2147483647,
        display: "grid",
        gap: 8,
        padding: "12px",
        borderRadius: 16,
        background: "rgba(8,10,22,.97)",
        border: "1px solid rgba(130,120,255,.5)",
        color: "white",
        boxShadow: "0 12px 40px rgba(0,0,0,.5)",
      }}
    >
      <span style={{ fontSize: 13, textAlign: "center" }}>
        {warning || `正在開啟${pending?.label ?? "網頁"}…`}
      </span>

      {pending ? (
        <a
          href={pending.relayUrl}
          target="_self"
          style={{
            display: "block",
            minHeight: 50,
            padding: "14px 16px",
            borderRadius: 999,
            background: "linear-gradient(135deg,#59d8ff,#8c5cff)",
            color: "#07101b",
            fontWeight: 800,
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          點我開啟{pending.label}
        </a>
      ) : null}

      <small style={{ opacity: 0.65, textAlign: "center" }}>
        {BUILD_ID}
      </small>
    </div>
  );
}
