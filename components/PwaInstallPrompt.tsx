"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function isStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as NavigatorWithStandalone).standalone === true
  );
}

export function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isInstalled, setIsInstalled] = useState(true);
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    const standalone = isStandaloneMode();
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

    setIsInstalled(standalone);
    setIsIos(ios && !standalone);
    setIsDismissed(window.sessionStorage.getItem("nubo-pwa-install-dismissed") === "1");

    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js").catch((cause) => {
        console.warn("NUBO service worker registration failed", cause);
      });
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setIsInstalled(false);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const dismiss = () => {
    window.sessionStorage.setItem("nubo-pwa-install-dismissed", "1");
    setIsDismissed(true);
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setIsInstalled(true);
    setInstallPrompt(null);
  };

  if (isInstalled || isDismissed || (!installPrompt && !isIos)) return null;

  return (
    <aside className="pwa-install" aria-label="安裝NUBO手機版">
      <div>
        <strong>把 NUBO 安裝到手機</strong>
        <span>
          {isIos
            ? "Safari：點分享，再選「加入主畫面」。"
            : "安裝後可由手機桌面直接開啟 NUBO。"}
        </span>
      </div>
      <div className="pwa-install-actions">
        {installPrompt ? (
          <button className="primary" type="button" onClick={() => void install()}>
            安裝
          </button>
        ) : null}
        <button className="secondary" type="button" onClick={dismiss}>
          稍後
        </button>
      </div>
    </aside>
  );
}
