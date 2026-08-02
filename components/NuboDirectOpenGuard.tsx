"use client";

import { useEffect, useRef } from "react";

const FALLBACK_SELECTORS = [
  ".mobile-youtube-action[href]",
  "#nubo-mobile-open-fallback a[href]",
  "[data-nubo-mobile-open-fallback][href]",
  "[data-nubo-mobile-open-dialog] a[href]",
].join(",");

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

    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const targetUrl = typeof url === "string" ? url : url?.toString() ?? "";

      if (target === "nubo_mobile_external" && targetUrl) {
        window.location.assign(targetUrl);
        return window;
      }

      return originalOpen(url, target, features);
    }) as typeof window.open;

    const launchFallback = (anchor: HTMLAnchorElement) => {
      const targetUrl = anchor.href || anchor.getAttribute("href") || "";
      removeFallbackContainer(anchor);
      if (!targetUrl) return;

      const now = Date.now();
      const last = lastLaunchRef.current;
      if (last.url === targetUrl && now - last.at < 3000) return;

      lastLaunchRef.current = { url: targetUrl, at: now };
      window.setTimeout(() => {
        window.location.assign(targetUrl);
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
      window.open = originalOpen;
    };
  }, []);

  return null;
}
