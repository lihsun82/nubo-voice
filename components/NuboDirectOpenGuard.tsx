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

export function NuboDirectOpenGuard() {
  const lastLaunchRef = useRef<{ url: string; at: number }>({
    url: "",
    at: 0,
  });

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
        external = originalOpen(
          targetUrl,
          EXTERNAL_WINDOW_NAME,
        );
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
      } catch {
        // Cross-origin windows may not allow opener updates.
      }

      try {
        external.focus();
      } catch {
        // Mobile browsers may ignore programmatic focus.
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

    const launchFallback = (anchor: HTMLAnchorElement) => {
      const targetUrl = anchor.href || anchor.getAttribute("href") || "";
      if (!targetUrl) {
        removeFallbackContainer(anchor);
        return;
      }

      const now = Date.now();
      const last = lastLaunchRef.current;
      if (last.url === targetUrl && now - last.at < 5000) return;

      if (anchor.dataset.nuboAutoClicked === "true") return;
      anchor.dataset.nuboAutoClicked = "true";
      lastLaunchRef.current = { url: targetUrl, at: now };

      window.localStorage.setItem("nubo_voice_auto_resume_v1", "true");
      window.localStorage.setItem("nubo_external_app_return_v1", "true");

      /*
       * V15.6.39: React often inserts the YouTube <a> itself as the added
       * mutation node. The previous scan only searched descendants, so the
       * button was never seen and never auto-clicked. The scan below now
       * checks the root element itself before scanning its children.
       */
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          if (!document.contains(anchor)) return;
          try {
            anchor.click();
          } catch {
            // The guarded fallback below gets one final chance.
          }
        }, 80);
      });

      window.setTimeout(() => {
        if (!document.contains(anchor)) return;

        if (document.visibilityState !== "visible") {
          removeFallbackContainer(anchor);
          return;
        }

        openInExternalTab(targetUrl);
      }, 650);
    };

    const scan = (root: ParentNode = document) => {
      // querySelectorAll() does not include root itself.
      if (
        root instanceof HTMLAnchorElement &&
        root.matches(FALLBACK_SELECTORS)
      ) {
        launchFallback(root);
      }

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
      window.open = originalOpen;
    };
  }, []);

  return null;
}
