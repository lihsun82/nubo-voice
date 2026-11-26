"use client";

import { useEffect, useState } from "react";
import { useNuboKioskLanguage } from "@/lib/nubo-kiosk-language";

const COPY = {
  zh: { title: "把 NUBO 安裝到手機", ios: "Safari：點分享，再選「加入主畫面」。", prompt: "安裝後可由手機桌面直接開啟 NUBO。", install: "安裝", later: "稍後" },
  en: { title: "Install NUBO on your phone", ios: "In Safari, tap Share, then Add to Home Screen.", prompt: "Open NUBO directly from your home screen.", install: "Install", later: "Later" },
  ja: { title: "スマートフォンに NUBO を追加", ios: "Safari の共有メニューで「ホーム画面に追加」を選択してください。", prompt: "ホーム画面から NUBO を直接開けます。", install: "追加", later: "後で" },
  ko: { title: "휴대전화에 NUBO 설치", ios: "Safari에서 공유를 누른 후 홈 화면에 추가를 선택하세요.", prompt: "홈 화면에서 NUBO를 바로 열 수 있습니다.", install: "설치", later: "나중에" },
  vi: { title: "Thêm NUBO vào màn hình chính", ios: "Trên Safari, chạm Chia sẻ rồi chọn Thêm vào màn hình chính.", prompt: "Mở NUBO ngay từ màn hình chính.", install: "Cài đặt", later: "Để sau" },
};

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
  const { language } = useNuboKioskLanguage();
  const copy = COPY[language];

  useEffect(() => {
    const standalone = isStandaloneMode();
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);

    setIsInstalled(standalone);
    setIsIos(ios && !standalone);
    setIsDismissed(window.sessionStorage.getItem("nubo-pwa-install-dismissed") === "1");

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator && window.isSecureContext) {
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
    <aside className="pwa-install" aria-label={copy.title}>
      <div>
        <strong>{copy.title}</strong>
        <span>{isIos ? copy.ios : copy.prompt}</span>
      </div>
      <div className="pwa-install-actions">
        {installPrompt ? (
          <button className="primary" type="button" onClick={() => void install()}>
            {copy.install}
          </button>
        ) : null}
        <button className="secondary" type="button" onClick={dismiss}>
          {copy.later}
        </button>
      </div>
    </aside>
  );
}
