# NUBO Voice

NUBO 是獨立的個人即時語音總管。此 Repository **不與 AinuboX1 共用程式碼、Secrets 或資料庫**；未來僅透過受權限管控的 API Adapter 互動。

## 目前能力

- OpenAI Realtime 即時語音對話
- 繁體中文 NUBO 人格與任務邏輯
- 每日／每小時追蹤需求草稿
- 高風險操作二次確認政策
- 可擴充 Skill / Adapter 架構

## 尚未啟用

- 正式持久化排程
- Gmail、Google Calendar、LINE／LINE WORKS
- AinuboX1 Adapter
- 背景推播與手機喚醒詞

## 本機啟動

```bash
cp .env.example .env.local
# 編輯 .env.local 並填入 OPENAI_API_KEY
npm install
npm run dev
```

瀏覽器開啟 `http://localhost:3000`，按下「啟動 NUBO」並允許麥克風權限。

## 環境變數

| 變數 | 必填 | 用途 |
|---|---|---|
| `OPENAI_API_KEY` | 是 | 只在伺服器建立短效 Realtime 憑證 |
| `OPENAI_SAFETY_IDENTIFIER` | 建議 | 穩定、不可反推個資的雜湊識別字串 |

API Key 不可放在 `NEXT_PUBLIC_*`、瀏覽器程式或 GitHub Commit。

## 驗證

```bash
npm run typecheck
npm run build
```

## 下一階段

正式的每天／每小時追蹤不應依靠本機 JSON。建議加入：

1. Supabase PostgreSQL：任務、排程、執行紀錄、審批紀錄。
2. n8n 或 Cloud Scheduler：定時喚醒 Worker。
3. LINE Messaging API：異常立即通知、每日彙整。
4. AinuboX1 Adapter：以 API 或 `workflow_dispatch` 觸發，不直接耦合。

詳細架構請見 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。
