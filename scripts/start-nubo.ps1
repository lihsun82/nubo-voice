$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-Location $projectRoot

"$(Get-Date -Format o) Starting NUBO" | Add-Content (Join-Path $logDir "server.log")
& npm.cmd run start *>> (Join-Path $logDir "server.log")
