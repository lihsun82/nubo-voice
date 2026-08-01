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

  Write-Host "`n> $Command $($Arguments -join ' ')" -ForegroundColor Cyan
  & $Command @Arguments

  if ($LASTEXITCODE -ne 0) {
    throw "$Command 執行失敗，結束碼：$LASTEXITCODE"
  }
}

Write-Host "========================================" -ForegroundColor DarkCyan
Write-Host " NUBO 正式主機更新與重啟" -ForegroundColor Cyan
Write-Host " Repo: $repoRoot" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor DarkCyan

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "找不到 Git。請先安裝 Git for Windows。"
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw "找不到 npm.cmd。請先安裝 Node.js 22 或更新 PATH。"
}

$trackedChanges = (& git status --porcelain --untracked-files=no) -join "`n"
if ($LASTEXITCODE -ne 0) {
  throw "目前資料夾不是可用的 Git 儲存庫。"
}

if ($trackedChanges.Trim()) {
  Write-Host "偵測到尚未提交的程式修改，為避免覆蓋而停止更新：" -ForegroundColor Yellow
  Write-Host $trackedChanges -ForegroundColor Yellow
  throw "請先保存或還原本機程式修改後再更新。未追蹤檔案與 .env.local 不會被此檢查阻擋。"
}

Invoke-NativeChecked -Command "git" -Arguments @("fetch", "origin", "main")

$currentBranch = (& git rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "無法讀取目前 Git 分支。"
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

Write-Host "`n正在停止此 NUBO 專案的舊 Node 程序……" -ForegroundColor Cyan
$escapedRepoRoot = [Regex]::Escape($repoRoot)
$nuboNodeProcesses = @(
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match $escapedRepoRoot
    }
)

foreach ($process in $nuboNodeProcesses) {
  Write-Host "停止 PID $($process.ProcessId)" -ForegroundColor DarkGray
  Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

$commit = (& git rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  $commit = "unknown"
}

Write-Host "`nNUBO 已更新至 main / $commit" -ForegroundColor Green
Write-Host "正在啟動 127.0.0.1:3000；請保持此視窗開啟。" -ForegroundColor Green
Write-Host "Cloudflare Tunnel 不會被此腳本關閉。" -ForegroundColor Gray
Write-Host "========================================`n" -ForegroundColor DarkCyan

& npm.cmd start

if ($LASTEXITCODE -ne 0) {
  throw "NUBO 啟動失敗，結束碼：$LASTEXITCODE"
}
