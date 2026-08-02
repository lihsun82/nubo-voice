"use client";

import { useEffect, useRef } from "react";

const FALLBACK_SELECTORS = [
  ".mobile-youtube-action[href]",
  "#nubo-mobile-open-fallback a[href]",
  "[data-nubo-mobile-open-fallback][href]",
  "[data-nubo-mobile-open-dialog] a[href]",
].join(",");

const EXTERNAL_WINDOW_NAME = "nubo_mobile_external";
const EXTERNAL_TARGET_NAMES = new Set([
  EXTERNAL_WINDOW_NAME,
  "nubo_external",
]);

function isMobileBrowser() {
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "") ||
    window.matchMedia("(pointer: coarse) and (max-width: 1100px)").matches
  );
}

function removeFallbackContainer(element: Element) {
  const container =
    element.closest(
      "#nubo-mobile-open-fallback, [data-nubo-mobile-open-dialog], [data-nubo-mobile-open-fallback], [role='dialog']",
    ) ?? element;
  container.remove();
}

function isStartNuboButton(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const button = target.closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return false;
  return button.textContent?.replace(/\s+/g, "").includes("啟動NUBO") === true;
}

export function NuboDirectOpenGuard() {
  const reservedTabRef = useRef<Window | null>(null);
  const lastLaunchRef = useRef<{ url: string; at: number }>({
    url: "",
    at: 0,
  });

  useEffect(() => {
    if (!isMobileBrowser()) return;

    const originalOpen = window.open.bind(window);

    const reserveExternalTab = () => {
      const current = reservedTabRef.current;
      if (current && !current.closed) return current;

      const reserved = originalOpen(
        "about:blank",
        EXTERNAL_WINDOW_NAME,
      );

      if (!reserved) return null;
      reservedTabRef.current = reserved;

      try {
        reserved.document.title = "NUBO 外部分頁";
        reserved.document.body.innerHTML = `
          <main style="min-height:100vh;display:grid;place-items:center;background:#080b12;color:#d9e7ff;font-family:system-ui;text-align:center;padding:24px">
            <div><strong>NUBO 外部分頁已就緒</strong><p style="opacity:.7">語音指令開啟的網站會顯示在此分頁。</p></div>
          </main>
        `;
      } catch {
        // about:blank 無法寫入時仍保留分頁控制權。
      }

      try {
        reserved.blur();
        window.focus();
      } catch {
        // 手機瀏覽器不允許程式切回原分頁時忽略。
      }

      return reserved;
    };

    const openInExternalTab = (targetUrl: string) => {
      let external = reservedTabRef.current;

      if (!external || external.closed) {
        external = originalOpen(
          targetUrl,
          EXTERNAL_WINDOW_NAME,
        );
      }

      if (!external) {
        window.dispatchEvent(
          new CustomEvent("nubo-external-tab-blocked", {
            detail: { url: targetUrl },
          }),
        );
        return null;
      }

      reservedTabRef.current = external;

      try {
        external.location.replace(targetUrl);
      } catch {
        try {
          external.location.href = targetUrl;
        } catch {
          window.dispatchEvent(
            new CustomEvent("nubo-external-tab-blocked", {
              detail: { url: targetUrl },
            }),
          );
          return null;
        }
      }

      try {
        external.focus();
      } catch {
        // 跨來源分頁不能控制焦點時忽略。
      }

      return external;
    };

    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const targetUrl = typeof url === "string" ? url : url?.toString() ?? "";

      if (target && EXTERNAL_TARGET_NAMES.has(target) && targetUrl) {
        return openInExternalTab(targetUrl);
      }

      return originalOpen(url, target, features);
    }) as typeof window.open;

    const handleStartNubo = (event: Event) => {
      if (!isStartNuboButton(event.target)) return;
      reserveExternalTab();
    };

    document.addEventListener("click", handleStartNubo, true);

    const launchFallback = (anchor: HTMLAnchorElement) => {
      const targetUrl = anchor.href || anchor.getAttribute("href") || "";
      removeFallbackContainer(anchor);
      if (!targetUrl) return;

      const now = Date.now();
      const last = lastLaunchRef.current;
      if (last.url === targetUrl && now - last.at < 3000) return;

      lastLaunchRef.current = { url: targetUrl, at: now };
      window.setTimeout(() => {
        openInExternalTab(targetUrl);
      }, 0);
    };

    const scan = (root: ParentNode = document) => {
      root
        .querySelectorAll<HTMLAnchorElement>(FALLBACK_SELECTORS)
        .forEach(launchFallback);

      root
        .querySelectorAll<HTMLElement>(
          "#nubo-mobile-open-fallback, [data-nubo-mobile-open-dialog]",
        )
        .forEach((element) => {
          const anchor = element.querySelector<HTMLAnchorElement>("a[href]");
          if (anchor) launchFallback(anchor);
          else element.remove();
        });
    };

    scan();

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) scan(node);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleStartNubo, true);
      window.open = originalOpen;
    };
  }, []);

  return null;
}
