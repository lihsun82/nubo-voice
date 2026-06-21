# NUBO Task Center v0.2

## 可執行工作

- 一次性與週期提醒
- AI 報告、文案與分析草稿
- 使用最新網路資料的研究
- 條件成立才回報的追蹤任務
- 每日或每小時簡報
- 任務立即執行、暫停與恢復

## 更新與啟動

```powershell
Set-Location C:\nubo-voice
git pull origin main
npm.cmd install
npm.cmd run dev
```

開啟 `http://localhost:3000`，按「啟動 NUBO」和「啟用桌面通知」。

## 背景檢查

NUBO 頁面開啟時，每 30 秒檢查到期任務。若要在頁面關閉時檢查，可由 Windows 工作排程器每五分鐘執行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\nubo-voice\scripts\check-tasks.ps1"
```

NUBO 本機伺服器必須保持執行。建議正式使用時先執行：

```powershell
npm.cmd run build
npm.cmd run start
```

## 語音範例

- 「每天早上九點幫我整理台灣旅館業的重要新聞。」
- 「每小時查台南康樂街周邊旅館價格，低於 1800 元才回報。」
- 「現在幫我整理今天要完成的工作，做成優先順序清單。」
- 「每天下午六點整理今天任務執行結果。」
- 「列出我的任務。」
- 「暫停旅館新聞任務。」

## 安全邊界

寄信、公開發布、刪除資料、付款、轉帳、改價、取消訂單與正式 PMS 操作不會直接執行。這些工作必須加入專用連接器、最小權限和再次確認。
