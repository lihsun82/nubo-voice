"use client";

import { useEffect } from "react";
import {
  isNuboMobileRuntime,
  launchNuboPhoneActionV2,
  resolveNuboPhoneActionV2,
  resolveWebsiteTargetAsPhoneApp,
} from "@/lib/nubo-phone-agent-v2";

function mapUrlToPhoneAction(rawUrl: string) {
  const direct = resolveWebsiteTargetAsPhoneApp(rawUrl);
  if (direct) {
    return resolveNuboPhoneActionV2(direct.app, direct.query);
  }

  try {
    const parsed = new URL(rawUrl, window.location.href);
    const host = parsed.hostname.toLowerCase();

    if (host === "line.me" || host.endsWith(".line.me")) {
      return resolveNuboPhoneActionV2("line");
    }
    if (host.includes("facebook.com")) {
      return resolveNuboPhoneActionV2("facebook", parsed.toString());
    }
    if (host.includes("instagram.com")) {
      return resolveNuboPhoneActionV2("instagram", parsed.toString());
    }
    if (host.includes("music.youtube.com")) {
      return resolveNuboPhoneActionV2("youtube_music", parsed.toString());
    }
    if (host.includes("youtube.com") || host === "youtu.be") {
      return resolveNuboPhoneActionV2("youtube", parsed.toString());
    }
    if (host.includes("google.com") && parsed.pathname.includes("maps")) {
      return resolveNuboPhoneActionV2("maps", parsed.toString());
    }
    if (host.includes("mail.google.com")) {
      return resolveNuboPhoneActionV2("gmail");
    }
    if (host.includes("open.spotify.com")) {
      return resolveNuboPhoneActionV2("spotify", parsed.toString());
    }
  } catch {
    return null;
  }

  return null;
}

export function NuboPhoneAgentV2Bridge() {
  useEffect(() => {
    if (!isNuboMobileRuntime()) return;

    const originalOpen = window.open.bind(window);

    const patchedOpen: typeof window.open = (
      url?: string | URL,
      target?: string,
      features?: string,
    ) => {
      const rawUrl = typeof url === "string" ? url : url?.toString() ?? "";
      const action = rawUrl ? mapUrlToPhoneAction(rawUrl) : null;

      if (action) {
        launchNuboPhoneActionV2(action);
        return window;
      }

      return originalOpen(url, target, features);
    };

    window.open = patchedOpen;

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const action = mapUrlToPhoneAction(anchor.href);
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      launchNuboPhoneActionV2(action);
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      if (window.open === patchedOpen) {
        window.open = originalOpen;
      }
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return null;
}
