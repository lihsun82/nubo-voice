$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectRoot "logs"
$profileDir = Join-Path $projectRoot "data\nubo-app-profile"
$serverUrl = "http://127.0.0.1:3000"
$appUrl = "$serverUrl/?nuboApp=1"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
Set-Location $projectRoot

function Test-NuboServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $serverUrl -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-NuboServer)) {
  Write-Host "Building NUBO..."
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    throw "NUBO build failed."
  }

  $stdoutLog = Join-Path $logDir "server.log"
  $stderrLog = Join-Path $logDir "server-error.log"
  "$(Get-Date -Format o) Starting NUBO server" | Add-Content $stdoutLog

  Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "start") `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 80; $attempt += 1) {
    Start-Sleep -Milliseconds 500
    if (Test-NuboServer) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw "NUBO server did not become ready. Check logs\server-error.log."
  }
}

$browserCandidates = @(
  (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:PROGRAMFILES "Google\Chrome\Application\chrome.exe"),
  (Join-Path ${env:PROGRAMFILES(X86)} "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:PROGRAMFILES "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path ${env:PROGRAMFILES(X86)} "Microsoft\Edge\Application\msedge.exe")
)

$browser = $browserCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) {
  throw "Chrome or Microsoft Edge was not found."
}

Get-CimInstance Win32_Process |
  Where-Object {
    ($_.Name -eq "chrome.exe" -or $_.Name -eq "msedge.exe") -and
    $_.CommandLine -and
    $_.CommandLine.Contains($profileDir)
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

Start-Sleep -Milliseconds 600

$sessionPaths = @(
  (Join-Path $profileDir "Default\Sessions"),
  (Join-Path $profileDir "Default\Current Session"),
  (Join-Path $profileDir "Default\Current Tabs"),
  (Join-Path $profileDir "Default\Last Session"),
  (Join-Path $profileDir "Default\Last Tabs")
)

foreach ($sessionPath in $sessionPaths) {
  Remove-Item -Recurse -Force $sessionPath -ErrorAction SilentlyContinue
}

$browserArguments = @(
  "--user-data-dir=$profileDir",
  "--app=$appUrl",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-session-crashed-bubble",
  "--disable-restore-session-state"
)

Start-Process -FilePath $browser -ArgumentList $browserArguments | Out-Null
Write-Host "NUBO opened in one clean dedicated window."
