$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:3000"

try {
    $payload = Invoke-RestMethod -Uri "$baseUrl/api/tasks" -Method Get -TimeoutSec 20
    $now = [DateTimeOffset]::UtcNow
    $due = @($payload.tasks | Where-Object {
        $_.status -eq "active" -and
        $_.nextRunAt -and
        ([DateTimeOffset]::Parse($_.nextRunAt) -le $now)
    } | Select-Object -First 3)

    foreach ($task in $due) {
        $body = @{ action = "run"; id = $task.id } | ConvertTo-Json
        Invoke-RestMethod `
            -Uri "$baseUrl/api/tasks/action" `
            -Method Post `
            -ContentType "application/json" `
            -Body $body `
            -TimeoutSec 300 | Out-Null
    }
} catch {
    $logDir = Join-Path $PSScriptRoot "..\logs"
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    "$(Get-Date -Format o) $($_.Exception.Message)" | Add-Content (Join-Path $logDir "task-check.log")
}
