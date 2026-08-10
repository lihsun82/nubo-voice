"use client";

import { useEffect } from "react";

const AUTO_FALLBACK_SELECTORS = [
  "#nubo-mobile-open-fallback a[href]",
  "[data-nubo-mobile-open-fallback][href]",
  "[data-nubo-mobile-open-dialog] a[href]",
].join(",");

const YOUTUBE_ACTION_SELECTOR = ".mobile-youtube-action[href]";
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

export function NuboDirectOpenGuard() {
  useEffect(() => {
    if (!isMobileBrowser()) return;

    const originalOpen = window.open.bind(window);

    const openInExternalTab = (targetUrl: string) => {
      let external: Window | null = null;

      window.dispatchEvent(
        new CustomEvent("nubo-before-external-tab", {
          detail: { url: targetUrl },
        }),
      );

      try {
        external = originalOpen(targetUrl, EXTERNAL_WINDOW_NAME);
      } catch {
        external = null;
      }

      if (!external) {
        window.dispatchEvent(
          new CustomEvent("nubo-external-tab-blocked", {
            detail: { url: targetUrl },
          }),
        );
        return null;
      }

      try {
        external.opener = null;
        external.focus();
      } catch {
        // Cross-origin/mobile focus restrictions are harmless here.
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

    /*
     * V15.6.40:
     * Do NOT synthesize click() on the visible "開啟：YouTube" action.
     * Synthetic clicks were opening a web tab and React immediately removed
     * the button via its onClick handler, even when Android did not hand off
     * to the YouTube app. Keep the action visible until the user performs a
     * real trusted tap, which is the only browser event that can reliably
     * carry user activation for an external-app handoff.
     */
    const onTrustedYouTubeClick = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>(YOUTUBE_ACTION_SELECTOR);
      if (!anchor || !event.isTrusted) return;

      window.localStorage.setItem("nubo_voice_auto_resume_v1", "true");
      window.localStorage.setItem("nubo_external_app_return_v1", "true");
    };

    document.addEventListener("click", onTrustedYouTubeClick, true);

    // Keep auto-cleanup only for legacy fallback/dialog elements. The visible
    // YouTube action is intentionally excluded so it can never disappear just
    // because a programmatic launch attempt ran.
    const processLegacyFallback = (anchor: HTMLAnchorElement) => {
      const targetUrl = anchor.href || anchor.getAttribute("href") || "";
      if (!targetUrl) {
        removeFallbackContainer(anchor);
        return;
      }

      window.localStorage.setItem("nubo_voice_auto_resume_v1", "true");
      window.localStorage.setItem("nubo_external_app_return_v1", "true");

      const opened = openInExternalTab(targetUrl);
      if (opened) removeFallbackContainer(anchor);
    };

    const scan = (root: ParentNode = document) => {
      if (
        root instanceof HTMLAnchorElement &&
        root.matches(AUTO_FALLBACK_SELECTORS)
      ) {
        processLegacyFallback(root);
      }

      root
        .querySelectorAll<HTMLAnchorElement>(AUTO_FALLBACK_SELECTORS)
        .forEach(processLegacyFallback);
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
      document.removeEventListener("click", onTrustedYouTubeClick, true);
      window.open = originalOpen;
    };
  }, []);

  return null;
}
