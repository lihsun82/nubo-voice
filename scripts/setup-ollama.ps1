$ErrorActionPreference = "Stop"

$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
    Write-Host "尚未安裝 Ollama。請先完成 Ollama for Windows 安裝，再重新執行本腳本。" -ForegroundColor Yellow
    exit 1
}

$model = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { "qwen3:4b" }
Write-Host "正在下載本機模型：$model"
& ollama pull $model

Write-Host ""
Write-Host "Ollama 本機備援已準備完成。"
Write-Host "模型：$model"
Write-Host "服務：http://127.0.0.1:11434"
& ollama list
