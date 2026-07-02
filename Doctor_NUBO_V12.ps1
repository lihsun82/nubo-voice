Write-Host "==============================" -ForegroundColor Cyan
Write-Host " NUBO V12 Doctor" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan

Set-Location "C:\nubo-voice"

Write-Host ""
Write-Host "[1] Checking route files..." -ForegroundColor Yellow

$automationRoute = "C:\nubo-voice\app\api\v12\automations\route.ts"
$runRoute = "C:\nubo-voice\app\api\v12\automations\run\route.ts"

if (Test-Path $automationRoute) {
  Write-Host "OK: automations route exists" -ForegroundColor Green
} else {
  Write-Host "MISSING: automations route" -ForegroundColor Red
}

if (Test-Path $runRoute) {
  Write-Host "OK: automations run route exists" -ForegroundColor Green
} else {
  Write-Host "MISSING: automations run route" -ForegroundColor Red
}

Write-Host ""
Write-Host "[2] Checking port 3000..." -ForegroundColor Yellow

$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Where-Object { $_.OwningProcess -ne 0 } |
  Select-Object -First 1

if ($port3000) {
  $pid3000 = $port3000.OwningProcess
  Write-Host "Port 3000 is used by PID: $pid3000" -ForegroundColor Yellow
  Get-CimInstance Win32_Process -Filter "ProcessId=$pid3000" |
    Select-Object ProcessId, CommandLine |
    Format-List
} else {
  Write-Host "Port 3000 is not running." -ForegroundColor Red
}

Write-Host ""
Write-Host "[3] Testing NUBO homepage..." -ForegroundColor Yellow

try {
  $home = Invoke-WebRequest -Uri "http://127.0.0.1:3000" -UseBasicParsing -TimeoutSec 30
  Write-Host "OK: Homepage is reachable. Status: $($home.StatusCode)" -ForegroundColor Green
} catch {
  Write-Host "FAIL: Homepage is not reachable." -ForegroundColor Red
}

Write-Host ""
Write-Host "[4] Testing /api/v12/automations..." -ForegroundColor Yellow

try {
  $auto = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/api/v12/automations" -TimeoutSec 30
  Write-Host "OK: /api/v12/automations works" -ForegroundColor Green
  $auto | Format-List
} catch {
  Write-Host "FAIL: /api/v12/automations failed" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "[5] Testing /api/v12/automations/run..." -ForegroundColor Yellow

try {
  $run = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3000/api/v12/automations/run" -TimeoutSec 30
  Write-Host "OK: /api/v12/automations/run works" -ForegroundColor Green
  $run | Format-List
} catch {
  Write-Host "FAIL: /api/v12/automations/run failed" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "==============================" -ForegroundColor Cyan
Write-Host " Doctor finished." -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
