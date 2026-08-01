import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const websiteAliases: Record<string, string> = {
  fb: "https://www.facebook.com/",
  facebook: "https://www.facebook.com/",
  臉書: "https://www.facebook.com/",
  ig: "https://www.instagram.com/",
  instagram: "https://www.instagram.com/",
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

const nuboAliases = new Set([
  "nubo",
  "nubovoice",
  "nubo voice",
  "努寶",
  "呼叫nubo",
  "喚醒nubo",
]);

const desktopApps: Record<
  string,
  { command: string; args?: string[]; label: string }
> = {
  line: {
    command: "explorer.exe",
    args: ["line://"],
    label: "LINE",
  },
  賴: {
    command: "explorer.exe",
    args: ["line://"],
    label: "LINE",
  },
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
  settings: {
    command: "explorer.exe",
    args: ["ms-settings:"],
    label: "Windows設定",
  },
  設定: {
    command: "explorer.exe",
    args: ["ms-settings:"],
    label: "Windows設定",
  },
  clock: {
    command: "explorer.exe",
    args: [
      "shell:AppsFolder\\Microsoft.WindowsAlarms_8wekyb3d8bbwe!App",
    ],
    label: "時鐘",
  },
  時鐘: {
    command: "explorer.exe",
    args: [
      "shell:AppsFolder\\Microsoft.WindowsAlarms_8wekyb3d8bbwe!App",
    ],
    label: "時鐘",
  },
};

const closeableApps: Record<
  string,
  { processNames: string[]; label: string }
> = {
  line: { processNames: ["LINE"], label: "LINE" },
  賴: { processNames: ["LINE"], label: "LINE" },
  calculator: {
    processNames: ["CalculatorApp", "calc"],
    label: "計算機",
  },
  calc: {
    processNames: ["CalculatorApp", "calc"],
    label: "計算機",
  },
  計算機: {
    processNames: ["CalculatorApp", "calc"],
    label: "計算機",
  },
  notepad: { processNames: ["notepad"], label: "記事本" },
  記事本: { processNames: ["notepad"], label: "記事本" },
  paint: { processNames: ["mspaint"], label: "小畫家" },
  小畫家: { processNames: ["mspaint"], label: "小畫家" },
  settings: {
    processNames: ["SystemSettings"],
    label: "Windows設定",
  },
  設定: {
    processNames: ["SystemSettings"],
    label: "Windows設定",
  },
  clock: { processNames: ["Time"], label: "時鐘" },
  時鐘: { processNames: ["Time"], label: "時鐘" },
  chrome: { processNames: ["chrome"], label: "Chrome" },
  edge: { processNames: ["msedge"], label: "Edge" },
  msedge: { processNames: ["msedge"], label: "Edge" },
  firefox: { processNames: ["firefox"], label: "Firefox" },
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function compactKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function powershellString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function powershellArray(values: string[]) {
  return `@(${values.map(powershellString).join(",")})`;
}

function normalizeClientWebsiteUrl(url: string) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname === "www.facebook.com") {
      parsed.hostname = "m.facebook.com";
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

function labelForWebsite(url: string) {
  if (/facebook\.com/i.test(url)) return "Facebook";
  if (/instagram\.com/i.test(url)) return "Instagram";
  if (/music\.youtube\.com/i.test(url)) return "YouTube Music";
  if (/youtube\.com|youtu\.be/i.test(url)) return "YouTube";
  if (/mail\.google\.com/i.test(url)) return "Gmail";
  if (/maps\.google\.com|google\.com\/maps/i.test(url)) {
    return "Google Maps";
  }
  if (/calendar\.google\.com/i.test(url)) return "Google Calendar";
  if (/google\.com/i.test(url)) return "Google";
  if (/chatgpt\.com/i.test(url)) return "ChatGPT";
  return "網頁";
}

export function getNuboPublicUrl() {
  return (
    process.env.NUBO_PUBLIC_URL ??
    `http://127.0.0.1:${process.env.PORT ?? "3000"}`
  );
}

export function resolveWebsite(target: string): string {
  const trimmed = target.trim();
  const key = normalizeKey(trimmed);

  if (
    nuboAliases.has(key) ||
    nuboAliases.has(compactKey(trimmed))
  ) {
    return getNuboPublicUrl();
  }

  if (websiteAliases[key]) {
    return websiteAliases[key];
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("只允許開啟HTTP或HTTPS網頁");
    }

    return url.toString();
  }

  if (
    /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)
  ) {
    return new URL(`https://${trimmed}`).toString();
  }

  return (
    "https://www.google.com/search?q=" +
    encodeURIComponent(trimmed)
  );
}

export function openWebsite(target: string) {
  const url = normalizeClientWebsiteUrl(
    resolveWebsite(target),
  );

  /*
   * Windows 本機版維持原本的 rundll32 開啟方式。
   * Railway、Linux、手機或公開網頁環境不能在伺服器端開瀏覽器，
   * 因此直接回傳 mobileUrl，交由目前使用者的瀏覽器開啟。
   * 這一層可兼容舊版 API route，避免再次出現「只支援 Windows」。
   */
  if (process.platform !== "win32") {
    return {
      opened: true,
      url,
      mobileUrl: url,
      mobileLabel: labelForWebsite(url),
      autoOpen: true,
      clientNavigation: true,
      executionTarget: "client-browser",
    };
  }

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

  return {
    opened: true,
    url,
    executionTarget: "local-windows",
  };
}

export async function showNuboWindow() {
  if (process.platform !== "win32") {
    const url = getNuboPublicUrl();

    return {
      shown: true,
      action: "client-navigation",
      url,
      mobileUrl: url,
      mobileLabel: "NUBO",
      autoOpen: true,
      executionTarget: "client-browser",
    };
  }

  const url = getNuboPublicUrl();
  const hints = powershellArray([
    "NUBO",
    "nubo",
    "localhost",
    "127.0.0.1",
    "nubo-voice",
  ]);
  const command = [
    "Add-Type -AssemblyName Microsoft.VisualBasic | Out-Null;",
    `$hints = ${hints};`,
    "$proc = Get-Process chrome,msedge,firefox -ErrorAction SilentlyContinue | Where-Object {",
    "  $title = $_.MainWindowTitle;",
    "  $_.MainWindowHandle -ne 0 -and ($hints | Where-Object { $title -match [regex]::Escape($_) })",
    "} | Select-Object -First 1;",
    "if ($proc) {",
    "  [Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id) | Out-Null;",
    "  Write-Output 'focused';",
    "} else {",
    `  Start-Process ${powershellString(url)};`,
    "  Write-Output 'opened';",
    "}",
  ].join(" ");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { windowsHide: true, timeout: 10_000 },
  );

  const action =
    stdout.trim().split(/\s+/).pop() || "opened";

  return { shown: true, action, url };
}

export function openDesktopApp(app: string) {
  const key = normalizeKey(app);

  /*
   * Gemini 偶爾可能把網站誤送到桌面 App 工具。
   * 在非 Windows 環境先救援常見網站與 LINE，回傳給手機瀏覽器。
   */
  if (process.platform !== "win32") {
    const websiteUrl = websiteAliases[key];

    if (websiteUrl) {
      const url = normalizeClientWebsiteUrl(websiteUrl);

      return {
        opened: true,
        app: labelForWebsite(url),
        url,
        mobileUrl: url,
        mobileLabel: labelForWebsite(url),
        autoOpen: true,
        clientNavigation: true,
        executionTarget: "client-browser",
      };
    }

    if (["line", "賴"].includes(key)) {
      const url = "https://line.me/R/nv/chat";

      return {
        opened: true,
        app: "LINE",
        url,
        mobileUrl: url,
        mobileLabel: "LINE",
        autoOpen: true,
        clientNavigation: true,
        executionTarget: "client-browser",
      };
    }

    throw new Error(
      "目前是手機或網頁環境；網站請使用開啟網站功能，Windows系統工具需在Windows本機版使用。",
    );
  }

  const action = desktopApps[key];

  if (!action) {
    throw new Error(
      "目前可開啟：LINE、計算機、記事本、小畫家、檔案總管、Windows設定、時鐘",
    );
  }

  const child = spawn(action.command, action.args ?? [], {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
  });

  child.unref();

  return {
    opened: true,
    app: action.label,
    executionTarget: "local-windows",
  };
}

export async function closeDesktopApp(app: string) {
  if (process.platform !== "win32") {
    throw new Error(
      "手機或網頁版無法直接關閉其他App；請在該App內關閉或返回NUBO。",
    );
  }

  const key = normalizeKey(app);
  const action = closeableApps[key];

  if (!action) {
    throw new Error(
      "目前可關閉：LINE、計算機、記事本、小畫家、Windows設定、時鐘、Chrome、Edge、Firefox",
    );
  }

  const command = [
    `$names = ${powershellArray(action.processNames)};`,
    "$closed = 0;",
    "Get-Process -ErrorAction SilentlyContinue | Where-Object { $names -contains $_.ProcessName -and $_.MainWindowHandle -ne 0 } | ForEach-Object {",
    "  if ($_.CloseMainWindow()) { $closed += 1 }",
    "};",
    "Start-Sleep -Milliseconds 350;",
    "Write-Output $closed;",
  ].join(" ");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { windowsHide: true, timeout: 10_000 },
  );

  const closed = Number(
    stdout.trim().split(/\s+/).pop() ?? 0,
  );

  return {
    closed: Number.isFinite(closed) ? closed : 0,
    app: action.label,
  };
}

export function listDesktopCapabilities() {
  return {
    websites: [...Object.keys(websiteAliases), "nubo"],
    apps: [
      ...new Set(
        Object.values(desktopApps).map(
          (item) => item.label,
        ),
      ),
    ],
    closeableApps: [
      ...new Set(
        Object.values(closeableApps).map(
          (item) => item.label,
        ),
      ),
    ],
  };
}
