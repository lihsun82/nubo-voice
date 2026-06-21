# NUBO Voice

NUBO 是一個獨立的繁體中文即時語音 AI 助理核心，負責語音互動、任務理解、權限判斷、排程需求與技能調度。

## 架構原則

- 與 `AinuboX1` 完全分離。
- 不共用程式碼、資料庫或環境變數。
- 只透過受控 API 或 GitHub Actions 介面呼叫外部技能。
- 高風險操作必須二次確認。

## 本機啟動

```bash
cp .env.example .env.local
npm install
npm run dev
```

瀏覽器開啟 `http://localhost:3000`。

## 必要環境變數

```env
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=marin
```

> 禁止提交 `.env.local`、API Key、Token 或其他正式憑證。

## 目前版本

v0.1：即時語音核心、追蹤需求草稿、權限與技能設定骨架。