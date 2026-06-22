import { spawn } from "node:child_process";

const websiteAliases: Record<string, string> = {
  fb: "https://www.facebook.com/",
  facebook: "https://www.facebook.com/",
  臉書: "https://www.facebook.com/",
  google: "https://www.google.com/",
  gmail: "https://mail.google.com/",
  youtube: "https://www.youtube.com/",
  "youtube music": "https://music.youtube.com/",
  youtubemusic: "https://music.youtube.com/",
  chatgpt: "https://chatgpt.com/",
  maps: "https://maps.google.com/",
  googlemaps: "https://maps.google.com/",
  地圖: "https://maps.google.com/",
  calendar: "https://calendar.google.com/",
  日曆: "https://calendar.google.com/",
};

const desktopApps: Record<
  string,
  { command: string; args?: string[]; label: string }
> = {
  calculator: { command: "calc.exe", label: "計算機" },
  calc: { command: "calc.exe", label: "計算機" },
  計算機: { command: "calc.exe", label: "計算機" },
  notepad: { command: "notepad.exe", label: "記事本" },
  記事本: { command: "notepad.exe", label: "記事本" },
  paint: { command: "mspaint.exe", label: "小畫家" },
  小畫家: { command: "mspaint.exe", label: "小畫家" },
  explorer: { command: "explorer.exe", label: "檔案總管" },
  files: { command: "explorer.exe", label: "檔案總管" },
  檔案總管: { command: "explorer.exe", label: "檔案總管" },
  settings: { command: "explorer.exe", args: ["ms-settings:"], label: "Windows設定" },
  設定: { command: "explorer.exe", args: ["ms-settings:"], label: "Windows設定" },
  clock: {
    command: "explorer.exe",
    args: ["shell:AppsFolder\\Microsoft.WindowsAlarms_8wekyb3d8bbwe!App"],
    label: "時鐘",
  },
  時鐘: {
    command: "explorer.exe",
    args: ["shell:AppsFolder\\Microsoft.WindowsAlarms_8wekyb3d8bbwe!App"],
    label: "時鐘",
  },
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveWebsite(target: string): string {
  const trimmed = target.trim();
  const key = normalizeKey(trimmed);
  if (websiteAliases[key]) return websiteAliases[key];

  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error("只允許開啟HTTP或HTTPS網頁");
    }
    return url.toString();
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    return new URL(`https://${trimmed}`).toString();
  }

  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export function openWebsite(target: string) {
  if (process.platform !== "win32") {
    throw new Error("目前自動開啟網頁只支援Windows版NUBO");
  }

  const url = resolveWebsite(target);
  const child = spawn(
    "rundll32.exe",
    ["url.dll,FileProtocolHandler", url],
    {
      detached: true,
      windowsHide: true,
      stdio: "ignore",
    },
  );
  child.unref();
  return { opened: true, url };
}

export function openDesktopApp(app: string) {
  if (process.platform !== "win32") {
    throw new Error("目前桌面工具只支援Windows版NUBO");
  }

  const key = normalizeKey(app);
  const action = desktopApps[key];
  if (!action) {
    throw new Error(
      "目前可開啟：計算機、記事本、小畫家、檔案總管、Windows設定、時鐘",
    );
  }

  const child = spawn(action.command, action.args ?? [], {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
  });
  child.unref();
  return { opened: true, app: action.label };
}

export function listDesktopCapabilities() {
  return {
    websites: Object.keys(websiteAliases),
    apps: [...new Set(Object.values(desktopApps).map((item) => item.label))],
  };
}
