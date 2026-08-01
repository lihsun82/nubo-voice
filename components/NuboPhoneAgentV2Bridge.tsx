"use client";

import { useEffect, useState } from "react";
import {
  isNuboMobileRuntime,
  launchNuboPhoneActionV2,
  NUBO_PHONE_LAUNCH_EVENT,
  resolveNuboPhoneActionV2,
  resolveWebsiteTargetAsPhoneApp,
  type NuboPhoneLaunchEventDetail,
} from "@/lib/nubo-phone-agent-v2";

function mapUrlToPhoneAction(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl, window.location.href);
    const host = parsed.hostname.toLowerCase();

    if (host === "line.me" || host.endsWith(".line.me")) {
      return resolveNuboPhoneActionV2("line");
    }
    if (host.includes("facebook.com")) {
      return resolveNuboPhoneActionV2(
        "facebook",
        parsed.toString(),
      );
    }
    if (host.includes("instagram.com")) {
      return resolveNuboPhoneActionV2(
        "instagram",
        parsed.toString(),
      );
    }
    if (host.includes("music.youtube.com")) {
      return resolveNuboPhoneActionV2(
        "youtube_music",
        parsed.toString(),
      );
    }
    if (
      host.includes("youtube.com") ||
      host === "youtu.be"
    ) {
      return resolveNuboPhoneActionV2(
        "youtube",
        parsed.toString(),
      );
    }
    if (
      host.includes("google.com") &&
      parsed.pathname.includes("maps")
    ) {
      return resolveNuboPhoneActionV2(
        "maps",
        parsed.toString(),
      );
    }
    if (host.includes("mail.google.com")) {
      return resolveNuboPhoneActionV2("gmail");
    }
    if (host.includes("open.spotify.com")) {
      return resolveNuboPhoneActionV2(
        "spotify",
        parsed.toString(),
      );
    }
  } catch {
    // App aliases such as FB, IG and LINE are handled below.
  }

  const direct = resolveWebsiteTargetAsPhoneApp(rawUrl);
  if (direct) {
    return resolveNuboPhoneActionV2(
      direct.app,
      direct.query,
    );
  }

  return null;
}

export function NuboPhoneAgentV2Bridge() {
  const [pendingAction, setPendingAction] =
    useState<NuboPhoneLaunchEventDetail | null>(null);

  useEffect(() => {
    if (!isNuboMobileRuntime()) return;

    const originalOpen = window.open.bind(window);

    const patchedOpen: typeof window.open = (
      url?: string | URL,
      target?: string,
      features?: string,
    ) => {
      const rawUrl =
        typeof url === "string"
          ? url
          : url?.toString() ?? "";
      const action = rawUrl
        ? mapUrlToPhoneAction(rawUrl)
        : null;

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
      if (anchor.dataset.nuboPhoneDirect === "true") {
        return;
      }

      const action = mapUrlToPhoneAction(anchor.href);
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      launchNuboPhoneActionV2(action);
    };

    const handleLaunch = (event: Event) => {
      const customEvent =
        event as CustomEvent<NuboPhoneLaunchEventDetail>;
      if (!customEvent.detail?.manualUrl) return;
      setPendingAction(customEvent.detail);
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener(
      NUBO_PHONE_LAUNCH_EVENT,
      handleLaunch,
    );

    return () => {
      if (window.open === patchedOpen) {
        window.open = originalOpen;
      }
      document.removeEventListener(
        "click",
        handleClick,
        true,
      );
      window.removeEventListener(
        NUBO_PHONE_LAUNCH_EVENT,
        handleLaunch,
      );
    };
  }, []);

  if (!pendingAction) return null;

  return (
    <aside
      className="nubo-phone-launch-card"
      role="status"
      aria-live="polite"
    >
      <div className="nubo-phone-launch-copy">
        <strong>
          正在開啟{pendingAction.label}
        </strong>
        <span>
          若手機沒有自動切換，請按下方按鈕。
        </span>
      </div>

      <div className="nubo-phone-launch-actions">
        <a
          href={pendingAction.manualUrl}
          data-nubo-phone-direct="true"
          onClick={() => setPendingAction(null)}
        >
          開啟{pendingAction.label}
        </a>

        {pendingAction.webUrl !==
        pendingAction.manualUrl ? (
          <a
            className="secondary"
            href={pendingAction.webUrl}
            data-nubo-phone-direct="true"
            onClick={() => setPendingAction(null)}
          >
            改開網頁
          </a>
        ) : null}

        <button
          type="button"
          aria-label="關閉開啟提示"
          onClick={() => setPendingAction(null)}
        >
          ×
        </button>
      </div>
    </aside>
  );
}
