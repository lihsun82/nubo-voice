"use client";

import { useEffect, useState } from "react";

type NativeBridge = {
  isNativeApp?: () => boolean;
  getNativeVersion?: () => string;
};

function readNativeVersion() {
  try {
    const bridge = (window as typeof window & { NuboNative?: NativeBridge }).NuboNative;
    if (!bridge?.getNativeVersion) return "";
    if (bridge.isNativeApp && bridge.isNativeApp() !== true) return "";
    return String(bridge.getNativeVersion() ?? "").trim();
  } catch {
    return "";
  }
}

function formatNativeVersion(value: string) {
  const match = value.match(/android-v(\d+)/i);
  return match ? `Android V${match[1]}` : value;
}

export function NuboBuildFooter() {
  const [nativeVersion, setNativeVersion] = useState("");

  useEffect(() => {
    const syncVersion = () => {
      const version = readNativeVersion();
      if (version) setNativeVersion(version);
    };

    syncVersion();
    window.addEventListener("nubo-native-ready", syncVersion);
    const retry = window.setTimeout(syncVersion, 500);

    return () => {
      window.removeEventListener("nubo-native-ready", syncVersion);
      window.clearTimeout(retry);
    };
  }, []);

  return (
    <footer>
      <span>
        {nativeVersion
          ? `NUBO ${formatNativeVersion(nativeVersion)}｜Web UI V22`
          : "NUBO Web UI V22｜瀏覽器版"}
      </span>
      <span>
        臺灣標準國語 Accent Lock・阿拉伯語／芬蘭語即時切換・Server VAD 400ms・延遲診斷・Pixel 熱管理
      </span>
    </footer>
  );
}
