param(
    [string]$Model = "qwen3:4b"
)

$ErrorActionPreference = "Stop"

Write-Host "Downloading Ollama model: $Model"
& ollama pull $Model

Write-Host ""
Write-Host "Ollama fallback is ready."
Write-Host "Model: $Model"
Write-Host "Service: http://127.0.0.1:11434"
& ollama list
