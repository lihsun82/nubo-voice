import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const browserNames = ["chrome", "msedge", "firefox"];

const closeTargets: Record<string, { label: string; patterns: string[] }> = {
  browser: { label: "瀏覽器視窗", patterns: ["."] },
  chrome: { label: "Chrome視窗", patterns: ["."] },
  edge: { label: "Edge視窗", patterns: ["."] },
  facebook: { label: "Facebook網頁", patterns: ["facebook", "臉書"] },
  fb: { label: "Facebook網頁", patterns: ["facebook", "臉書"] },
  gmail: { label: "Gmail網頁", patterns: ["gmail"] },
  google: { label: "Google網頁", patterns: ["google"] },
  youtube: { label: "YouTube網頁", patterns: ["youtube", "music"] },
  youtubemusic: { label: "YouTube Music網頁", patterns: ["youtube music", "music"] },
  chatgpt: { label: "ChatGPT網頁", patterns: ["chatgpt"] },
  maps: { label: "Google地圖網頁", patterns: ["maps", "地圖"] },
  calendar: { label: "Google日曆網頁", patterns: ["calendar", "日曆"] },
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function powershellString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function targetConfig(target: string) {
  const key = normalize(target || "browser");
  return closeTargets[key] ?? {
    label: `${target}網頁`,
    patterns: [target.trim()].filter(Boolean),
  };
}

export async function closeBrowserWindow(target: string) {
  if (process.platform !== "win32") {
    throw new Error("關閉網頁目前只支援Windows版NUBO");
  }

  const config = targetConfig(target);
  const processList =
    normalize(target) === "edge"
      ? ["msedge"]
      : normalize(target) === "chrome"
        ? ["chrome"]
        : browserNames;
  const patternArray = `@(${config.patterns.map(powershellString).join(",")})`;
  const browserArray = `@(${processList.map(powershellString).join(",")})`;
  const command = [
    `$names = ${browserArray};`,
    `$patterns = ${patternArray};`,
    "$closed = 0;",
    "Get-Process | Where-Object { $names -contains $_.ProcessName -and $_.MainWindowHandle -ne 0 } | ForEach-Object {",
    "  $title = $_.MainWindowTitle;",
    "  $match = $false;",
    "  foreach ($pattern in $patterns) { if ($title -match [regex]::Escape($pattern) -or $pattern -eq '.') { $match = $true } }",
    "  if ($match) { if ($_.CloseMainWindow()) { $closed += 1 } }",
    "};",
    "Start-Sleep -Milliseconds 350;",
    "Write-Output $closed;",
  ].join(" ");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { windowsHide: true, timeout: 10_000 },
  );
  const closed = Number(stdout.trim().split(/\s+/).pop() ?? 0);
  return { closed: Number.isFinite(closed) ? closed : 0, target: config.label };
}
