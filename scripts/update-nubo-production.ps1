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
Write-Host "Stopping old Node processes for this NUBO repository..." -ForegroundColor Cyan
$escapedRepoRoot = [Regex]::Escape($repoRoot)
$nuboNodeProcesses = @(
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object {
      $_.CommandLine -and ($_.CommandLine -match $escapedRepoRoot)
    }
)

foreach ($process in $nuboNodeProcesses) {
  Write-Host ("Stopping PID " + $process.ProcessId) -ForegroundColor DarkGray
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

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
