"use client";

import { useEffect, useRef, useState } from "react";

const BUILD_ID = "public-web-navigation-v4-20260801";
const AUTO_RESUME_KEY = "nubo_voice_auto_resume_v1";
const EXTERNAL_RETURN_KEY = "nubo_external_app_return_v1";

type PendingNavigation = {
  url: string;
  label: string;
};

type ExternalNavigationDetail = {
  url?: string;
  label?: string;
};

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function knownDestination(value: unknown) {
  const key = normalizeKey(value);

  if (["facebook", "fb", "臉書"].includes(key)) {
    return {
      url: "https://m.facebook.com/",
      label: "Facebook",
    };
  }

  if (["instagram", "ig"].includes(key)) {
    return {
      url: "https://www.instagram.com/",
      label: "Instagram",
    };
  }

  if (["youtube", "yt", "油管"].includes(key)) {
    return {
      url: "https://www.youtube.com/",
      label: "YouTube",
    };
  }

  if (["gmail", "googlemail"].includes(key)) {
    return {
      url: "https://mail.google.com/",
      label: "Gmail",
    };
  }

  if (
    [
      "maps",
      "googlemaps",
      "地圖",
      "google地圖",
    ].includes(key)
  ) {
    return {
      url: "https://www.google.com/maps/",
      label: "Google Maps",
    };
  }

  if (["line", "賴"].includes(key)) {
    return {
      url: "https://line.me/R/nv/chat",
      label: "LINE",
    };
  }

  return null;
}

function destinationFromText(text: string) {
  const normalized = text
    .toLowerCase()
    .replace(/[\s，。！？、:：…]+/g, "");

  const wantsOpen =
    /(開啟|打開|啟動|正在開啟|幫我開)/.test(
      normalized,
    );

  if (!wantsOpen) return null;

  if (/(facebook|臉書|fb)/.test(normalized)) {
    return knownDestination("facebook");
  }

  if (/(instagram|ig)/.test(normalized)) {
    return knownDestination("instagram");
  }

  if (/(youtube|油管)/.test(normalized)) {
    return knownDestination("youtube");
  }

  if (/gmail/.test(normalized)) {
    return knownDestination("gmail");
  }

  if (/(googlemaps|google地圖|地圖)/.test(normalized)) {
    return knownDestination("maps");
  }

  return null;
}

function normalizeExternalUrl(rawValue: string) {
  const raw = rawValue.trim();
  if (!raw) return null;

  if (/^(tel|sms|mailto):/i.test(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw, window.location.origin);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    if (parsed.origin === window.location.origin) {
      return null;
    }

    if (parsed.hostname === "www.facebook.com") {
      parsed.hostname = "m.facebook.com";
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function labelForUrl(url: string) {
  if (/facebook\.com/i.test(url)) return "Facebook";
  if (/instagram\.com/i.test(url)) return "Instagram";
  if (/youtube\.com|youtu\.be/i.test(url)) return "YouTube";
  if (/mail\.google\.com/i.test(url)) return "Gmail";
  if (/google\.com\/maps/i.test(url)) return "Google Maps";
  if (/line\.me/i.test(url)) return "LINE";
  return "外部網頁";
}

export function NuboPublicWebNavigationBridge() {
  const [pending, setPending] =
    useState<PendingNavigation | null>(null);
  const [warning, setWarning] = useState("");
  const lastNavigationRef = useRef("");

  useEffect(() => {
    const hostname = window.location.hostname.toLowerCase();

    if (
      [
        "localhost",
        "127.0.0.1",
        "::1",
      ].includes(hostname)
    ) {
      return;
    }

    const prepareNavigation = (
      rawUrl: string,
      suppliedLabel?: string,
      autoNavigate = true,
    ) => {
      const url = normalizeExternalUrl(rawUrl);
      if (!url) return;

      const label = suppliedLabel || labelForUrl(url);
      const token = `${url}:${Math.floor(Date.now() / 4000)}`;

      if (lastNavigationRef.current === token) {
        return;
      }

      lastNavigationRef.current = token;

      window.localStorage.setItem(
        AUTO_RESUME_KEY,
        "true",
      );
      window.localStorage.setItem(
        EXTERNAL_RETURN_KEY,
        "true",
      );

      setPending({ url, label });

      if (!autoNavigate) return;

      /*
       * 不覆寫window.open，也不攔截fetch。
       * 讓既有語音主控台使用原生瀏覽器導向；
       * 這裡只作為轉錄層備援，避免重複導向與錯誤判定。
       */
      window.setTimeout(() => {
        try {
          window.location.assign(url);
        } catch {
          setPending({ url, label });
        }
      }, 0);
    };

    const handleExternalNavigation = (event: Event) => {
      const detail = (
        event as CustomEvent<ExternalNavigationDetail>
      ).detail;
      const rawUrl = String(detail?.url ?? "").trim();

      if (rawUrl) {
        prepareNavigation(
          rawUrl,
          detail?.label,
          true,
        );
      }
    };

    window.addEventListener(
      "nubo-open-external",
      handleExternalNavigation,
    );

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const target = mutation.target;

        if (
          target instanceof Element &&
          target.closest(
            "[data-nubo-navigation-card='true']",
          )
        ) {
          continue;
        }

        const text = target.textContent ?? "";
        const destination = destinationFromText(text);

        if (destination) {
          prepareNavigation(
            destination.url,
            destination.label,
            true,
          );
          return;
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    void fetch(`/api/health?ts=${Date.now()}`, {
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((health) => {
        if (health?.build !== BUILD_ID) {
          setWarning(
            `目前網域仍載入舊版：${String(
              health?.build ?? "unknown",
            )}`,
          );
        }
      })
      .catch(() => {
        setWarning("無法確認網域部署版本");
      });

    return () => {
      window.removeEventListener(
        "nubo-open-external",
        handleExternalNavigation,
      );
      observer.disconnect();
    };
  }, []);

  if (!pending && !warning) {
    return null;
  }

  return (
    <div
      data-nubo-navigation-card="true"
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 2147483647,
        display: "flex",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 12px",
        borderRadius: 14,
        background: "rgba(8,10,22,.96)",
        border: "1px solid rgba(130,120,255,.45)",
        color: "white",
        boxShadow: "0 10px 34px rgba(0,0,0,.45)",
      }}
    >
      <span style={{ fontSize: 13 }}>
        {warning ||
          `若未自動開啟${pending?.label ?? "網頁"}，請按右側。`}
      </span>

      {pending ? (
        <a
          href={pending.url}
          target="_self"
          onClick={() => {
            window.localStorage.setItem(
              AUTO_RESUME_KEY,
              "true",
            );
            window.localStorage.setItem(
              EXTERNAL_RETURN_KEY,
              "true",
            );
          }}
          style={{
            flex: "0 0 auto",
            padding: "8px 12px",
            borderRadius: 10,
            background:
              "linear-gradient(135deg,#59d8ff,#8c5cff)",
            color: "#07101b",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          開啟{pending.label}
        </a>
      ) : null}
    </div>
  );
}
