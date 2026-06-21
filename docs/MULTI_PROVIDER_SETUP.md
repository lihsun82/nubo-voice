# NUBO 多模型設定

## 核心規則

同一個環境變數不能寫四次，後面的值會覆蓋前面的值。請改用一條逗號分隔的備援鏈：

```env
NUBO_AI_PROVIDER_CHAIN=gemini,ollama,groq,openai
NUBO_VOICE_PROVIDER=gemini
```

一般工作依序使用 Gemini、Ollama、Groq、OpenAI。需要最新網路資訊時，離線的 Ollama 會移到最後，順序為 Gemini、Groq、OpenAI、Ollama。

## `.env.local` 範例

```env
NUBO_AI_PROVIDER_CHAIN=gemini,ollama,groq,openai
NUBO_VOICE_PROVIDER=gemini

GEMINI_API_KEY=貼上Google AI Studio建立的金鑰
GEMINI_TEXT_MODEL=gemini-3.5-flash
GEMINI_LIVE_MODEL=gemini-3.1-flash-live-preview

OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b

GROQ_API_KEY=貼上Groq Console建立的金鑰
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_RESEARCH_MODEL=groq/compound

OPENAI_API_KEY=
OPENAI_WORK_MODEL=gpt-5.4-mini
OPENAI_SAFETY_IDENTIFIER=nubo-owner-hashed-id
```

OpenAI為可選備援；不使用時將 `OPENAI_API_KEY` 保持空白。Groq也是可選；沒有金鑰時系統會自動略過。

## Ollama本機模型

先完成Ollama for Windows安裝，再執行：

```powershell
Set-Location C:\nubo-voice
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-ollama.ps1
```

腳本會下載預設的 `qwen3:4b`。需要更高品質且電腦記憶體足夠時，可改成：

```powershell
$env:OLLAMA_MODEL="qwen3:8b"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-ollama.ps1
```

## 啟動

```powershell
Set-Location C:\nubo-voice
git pull origin main
npm.cmd install
npm.cmd run dev
```

開啟 `http://localhost:3000`。頁面會顯示目前語音引擎與工作備援鏈。Gemini和OpenAI金鑰都存在時，可以在頁面手動切換語音引擎。

## 自動備援

每次工作執行後，成果底部會標記實際使用的引擎與模型。某個引擎遇到額度、連線或模型錯誤時，NUBO會自動嘗試下一個，不需要重新建立任務。
