param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

function Invoke-NativeChecked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,

    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  Write-Host ""
  Write-Host ("> " + $Command + " " + ($Arguments -join " ")) -ForegroundColor Cyan
  & $Command @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw ($Command + " failed with exit code " + $LASTEXITCODE)
  }
}

function Get-NuboListenerProcessIds {
  $processIds = @()
  $tcpCommand = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue

  if ($tcpCommand) {
    $connections = @(
      Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    )

    foreach ($connection in $connections) {
      if ($connection.OwningProcess) {
        $processIds += [int]$connection.OwningProcess
      }
    }
  }
  else {
    $netstatLines = @(& netstat.exe -ano -p tcp 2>$null)

    foreach ($line in $netstatLines) {
      if ($line -match '^\s*TCP\s+\S+:3000\s+\S+\s+LISTENING\s+(\d+)\s*$') {
        $processIds += [int]$Matches[1]
      }
    }
  }

  return @($processIds | Sort-Object -Unique)
}

Write-Host "========================================" -ForegroundColor DarkCyan
Write-Host " NUBO production update and restart" -ForegroundColor Cyan
Write-Host (" Repo: " + $repoRoot) -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor DarkCyan

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git was not found. Install Git for Windows first."
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw "npm.cmd was not found. Install Node.js 22 or fix PATH first."
}

$generatedTrackedFiles = @(
  "next-env.d.ts",
  "tsconfig.tsbuildinfo"
)

foreach ($generatedFile in $generatedTrackedFiles) {
  & git ls-files --error-unmatch -- $generatedFile 2>$null | Out-Null
  $isTracked = ($LASTEXITCODE -eq 0)

  if (-not $isTracked) {
    continue
  }

  $generatedChange = (& git status --porcelain -- $generatedFile) -join [Environment]::NewLine
  if ($LASTEXITCODE -ne 0) {
    throw ("Unable to inspect generated file: " + $generatedFile)
  }

  if ($generatedChange.Trim()) {
    Write-Host ("Restoring generated file before update: " + $generatedFile) -ForegroundColor DarkGray
    Invoke-NativeChecked -Command "git" -Arguments @("restore", "--worktree", "--", $generatedFile)
  }
}

$trackedChanges = (& git status --porcelain --untracked-files=no) -join [Environment]::NewLine
if ($LASTEXITCODE -ne 0) {
  throw "The current folder is not a valid Git repository."
}

if ($trackedChanges.Trim()) {
  Write-Host "Tracked local changes were found. Update stopped to prevent data loss:" -ForegroundColor Yellow
  Write-Host $trackedChanges -ForegroundColor Yellow
  throw "Commit, stash, or restore tracked local changes before updating. Untracked files and .env.local are not blocked."
}

Invoke-NativeChecked -Command "git" -Arguments @("fetch", "origin", "main")

$currentBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Unable to read the current Git branch."
}

if ($currentBranch -ne "main") {
  Invoke-NativeChecked -Command "git" -Arguments @("checkout", "main")
}

Invoke-NativeChecked -Command "git" -Arguments @("pull", "--ff-only", "origin", "main")

if (-not $SkipInstall) {
  if (Test-Path (Join-Path $repoRoot "package-lock.json")) {
    Invoke-NativeChecked -Command "npm.cmd" -Arguments @("ci")
  }
  else {
    Invoke-NativeChecked -Command "npm.cmd" -Arguments @("install")
  }
}

Invoke-NativeChecked -Command "npm.cmd" -Arguments @("run", "typecheck")
Invoke-NativeChecked -Command "npm.cmd" -Arguments @("run", "build")

Write-Host ""
Write-Host "Stopping the Node process listening on port 3000..." -ForegroundColor Cyan
$listenerProcessIds = @(Get-NuboListenerProcessIds)

foreach ($processId in $listenerProcessIds) {
  $processInfo = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $processId) -ErrorAction SilentlyContinue

  if (-not $processInfo) {
    continue
  }

  $processName = [string]$processInfo.Name
  if ($processName.ToLowerInvariant() -ne "node.exe") {
    throw ("Port 3000 is used by non-Node process PID " + $processId + " (" + $processName + "). Stop it manually.")
  }

  Write-Host ("Stopping NUBO Node PID " + $processId) -ForegroundColor DarkGray
  Stop-Process -Id $processId -Force -ErrorAction Stop
}

Start-Sleep -Seconds 2

$remainingProcessIds = @(Get-NuboListenerProcessIds)
if ($remainingProcessIds.Count -gt 0) {
  throw ("Port 3000 is still in use by PID(s): " + ($remainingProcessIds -join ", "))
}

$commit = (& git rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  $commit = "unknown"
}

Write-Host ""
Write-Host ("NUBO is updated to main / " + $commit) -ForegroundColor Green
Write-Host "Starting NUBO on 127.0.0.1:3000. Keep this window open." -ForegroundColor Green
Write-Host "This script does not stop Cloudflare Tunnel." -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor DarkCyan
Write-Host ""

& npm.cmd start

if ($LASTEXITCODE -ne 0) {
  throw ("NUBO startup failed with exit code " + $LASTEXITCODE)
}
