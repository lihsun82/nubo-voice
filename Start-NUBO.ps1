$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

$env:NUBO_PUBLIC_URL = if ($env:NUBO_PUBLIC_URL) { $env:NUBO_PUBLIC_URL } else { "http://127.0.0.1:3000" }

Write-Host "Starting NUBO Voice..." -ForegroundColor Cyan

$nodeProcess = Start-Process powershell.exe -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command",
  "Set-Location '$PSScriptRoot'; npm run dev"
) -WindowStyle Minimized -PassThru

Start-Sleep -Seconds 4
Start-Process $env:NUBO_PUBLIC_URL

Write-Host "NUBO is opening at $env:NUBO_PUBLIC_URL" -ForegroundColor Green
Write-Host "When the page is open, press 啟動NUBO and allow microphone access." -ForegroundColor Yellow
