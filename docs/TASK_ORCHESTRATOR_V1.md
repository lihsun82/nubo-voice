# NUBO Task Orchestrator V1

第一階段目標：讓 NUBO 從「單一任務回答」升級成「受控任務指揮中心」。

## 範圍

V1 只啟用內部工具型代理人，不啟用未知外部代理人自動搜尋。

目前內部代理角色：

- `planner`：任務拆解、風險分級、驗收條件
- `research`：查詢與來源整理
- `data`：資料表、營運指標、結構化整理
- `report`：報告、PDF/HTML/Word/Excel 檔案需求整理
- `mail`：草稿、白名單寄送、收件匣交付
- `coding`：程式檢查與變更建議
- `qa`：驗收與測試
- `device`：白名單桌機與設備控制

## 風險分級

| 等級 | 自動化策略 |
|---|---|
| L1 | 可自動建立一次性任務 |
| L2 | 可自動建立一次性任務，但只交付到 NUBO 收件匣 |
| L3 | 只產生計畫，不自動執行；需人工確認 |
| L4 | 只產生計畫，不自動執行；涉及不可逆或高權限動作 |

## 固定保護規則

以下範圍預設禁止修改，除非使用者明確要求並二次確認：

- `/api/line/webhook`
- LINE webhook 驗證
- LINE 指令解析
- 桌機控制函式
- LINE 控制穩定版

## API

### `POST /api/orchestrator`

Request:

```json
{
  "instruction": "幫我整理明天旅館市場雷達，產出重點摘要與 PDF/HTML 檔案需求",
  "createTask": false
}
```

Response:

```json
{
  "ok": true,
  "plan": {
    "riskLevel": "L2",
    "agents": ["planner", "research", "data", "report", "qa"],
    "canAutoCreateTask": true
  },
  "task": null
}
```

將 `createTask` 設為 `true` 時，若任務為 L1/L2，會建立一次性任務並交付到 NUBO 收件匣。若為 L3/L4，只回傳計畫與阻擋原因。

## 驗收方式

```bash
npm run typecheck
npm run build
```

手動測試：

1. 開啟 NUBO 首頁。
2. 在「任務指揮中心」輸入低風險任務。
3. 點擊「先拆解任務」。
4. 確認風險等級、代理人步驟、驗收條件。
5. 點擊「建立一次性任務」。
6. 等待 Task Center 執行並檢查 NUBO 收件匣。

## 停損條件

- 連續失敗 2 次即停止。
- L3/L4 任務不自動執行。
- 不允許未知外部代理人自動取得資料或權限。
- 不允許讀取、輸出或提交 Secrets / API Keys / Token。
