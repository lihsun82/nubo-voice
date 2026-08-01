"use client";

import { useEffect, useState } from "react";

type PendingExternal = {
  url: string;
  label: string;
};

function isMobileDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent || "";
  const ipadOs = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const coarsePointer = window.matchMedia(
    "(pointer: coarse) and (max-width: 1100px)",
  ).matches;

  return mobileUserAgent || ipadOs || coarsePointer;
}

function normalizeExternalUrl(raw: string) {
  const value = raw.trim();
  if (!value) return null;

  if (/^(tel|sms|mailto):/i.test(value)) {
    return value;
  }

  let url: URL;
  try {
    url = new URL(value, window.location.origin);
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (url.origin === window.location.origin) return null;

  // Facebook 的手機版網頁比桌面版在 PWA／手機瀏覽器中更穩定。
  if (url.hostname === "www.facebook.com") {
    url.hostname = "m.facebook.com";
  }

  return url.toString();
}

function labelForUrl(url: string) {
  if (/facebook\.com/i.test(url)) return "Facebook";
  if (/instagram\.com/i.test(url)) return "Instagram";
  if (/youtube\.com|youtu\.be/i.test(url)) return "YouTube";
  if (/google\.com\/maps/i.test(url)) return "Google Maps";
  if (/mail\.google\.com/i.test(url)) return "Gmail";
  if (/^tel:/i.test(url)) return "電話";
  if (/^sms:/i.test(url)) return "簡訊";
  if (/^mailto:/i.test(url)) return "Email";
  return "外部網頁";
}

export function NuboMobileExternalOpenGuard() {
  const [pending, setPending] = useState<PendingExternal | null>(null);

  useEffect(() => {
    if (!isMobileDevice()) return;

    const originalOpen = window.open.bind(window);

    const mobileOpen: typeof window.open = ((
      url?: string | URL,
      target?: string,
      features?: string,
    ) => {
      const raw = typeof url === "string" ? url : url?.toString() ?? "";
      const externalUrl = normalizeExternalUrl(raw);

      if (!externalUrl) {
        return originalOpen(url, target, features);
      }

      const label = labelForUrl(externalUrl);
      setPending({ url: externalUrl, label });

      window.localStorage.setItem("nubo_voice_auto_resume_v1", "true");
      window.localStorage.setItem("nubo_external_app_return_v1", "true");

      /*
       * 語音工具完成後已不屬於瀏覽器認定的直接點擊事件，
       * _blank 很容易被手機封鎖。改用目前頁面直接導向，
       * 不依賴彈出視窗權限；返回 NUBO 時既有流程會恢復語音。
       */
      try {
        window.location.assign(externalUrl);
      } catch {
        // 保留下方手動按鈕作為最終備援。
      }

      return window;
    }) as typeof window.open;

    window.open = mobileOpen;

    return () => {
      if (window.open === mobileOpen) {
        window.open = originalOpen;
      }
    };
  }, []);

  if (!pending) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "max(12px, env(safe-area-inset-left))",
        right: "max(12px, env(safe-area-inset-right))",
        bottom: "max(14px, env(safe-area-inset-bottom))",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        border: "1px solid rgba(255,255,255,.18)",
        borderRadius: 16,
        background: "rgba(9,12,18,.96)",
        boxShadow: "0 16px 48px rgba(0,0,0,.45)",
        backdropFilter: "blur(18px)",
      }}
    >
      <span style={{ color: "#f6f7fb", fontSize: 14 }}>
        若手機沒有自動開啟，請按右側按鈕。
      </span>
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
    </div>
  );
}
