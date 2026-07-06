# NUBO Agent Approval Audit V4

第四階段目標：把第三階段的外部代理人候選，升級成可審核、可追蹤、可停損的授權流程。

## 核心原則

V4 仍不讓外部代理人直接取得權限。它只做三件事：

1. 建立授權請求
2. 核准 / 拒絕授權請求
3. 保存 audit log

```text
任務拆解
↓
外部代理人候選
↓
建立授權請求
↓
使用者核准 / 拒絕
↓
寫入 data/agent-approvals.json
↓
後續版本才允許受控執行
```

## 新增檔案

- `lib/agent-approval-store.ts`
- `app/api/agent-approvals/route.ts`
- `app/api/agent-approvals/[id]/route.ts`
- `docs/AGENT_APPROVAL_AUDIT_V4.md`

## API

### `GET /api/agent-approvals`

讀取最近授權請求。

### `POST /api/agent-approvals`

建立授權請求。

Request:

```json
{
  "taskTitle": "旅館市場雷達",
  "instruction": "幫我整理明天新寶智慧一中館房價雷達",
  "riskLevel": "L2",
  "handoff": {
    "agentId": "hotel-radar-adapter",
    "agentName": "Hotel Radar Adapter",
    "kind": "internal_adapter",
    "status": "planned",
    "matchedCapabilities": ["hotel_market_scan"],
    "reason": "任務命中旅館雷達能力",
    "requiresApproval": true,
    "riskLevel": "L2",
    "allowedOutputs": ["市場摘要", "HTML 報告"],
    "forbiddenActions": ["自動改正式售價"]
  }
}
```

### `PATCH /api/agent-approvals/{id}`

核准或拒絕授權請求。

Request:

```json
{
  "decision": "approved",
  "approvalNote": "核准此任務讀取旅館雷達資料，但不得自動改價。"
}
```

## 本機資料

授權請求寫入：

```text
data/agent-approvals.json
```

每筆紀錄包含：

- taskTitle
- instruction
- riskLevel
- handoff
- requestedScope
- approvalNote
- status
- createdAt
- updatedAt
- decidedAt
- expiresAt

## 前台功能

Task Center 已升級為：

```text
TASK ORCHESTRATOR V4
AGENT APPROVAL CENTER
```

外部代理人候選卡新增：

- 建立授權請求
- 顯示可輸出項目
- 顯示禁止動作

授權中心新增：

- pending 數量
- 核准
- 拒絕
- 到期時間
- 授權範圍

## 安全邊界

V4 仍禁止：

- 自動授權未知外部代理人
- 自動讀取 Secrets / API Keys / Token
- 自動改 DNS / 金流 / 法律文件
- 自動部署
- 自動合併 PR
- 自動寄非白名單 Email
- 修改 LINE 控制穩定版相關檔案

保護範圍延續：

- `/api/line/webhook`
- LINE webhook 驗證
- LINE 指令解析
- 桌機控制函式
- LINE 控制穩定版

## 驗收測試

```bash
npm run typecheck
npm run build
npm run dev
```

手動測試：

1. 開啟首頁。
2. 輸入：

```text
幫我整理明天新寶智慧一中館房價雷達，產出 HTML 報告，並判斷是否需要外部代理人補強。
```

3. 點擊「先拆解任務」。
4. 在外部代理人候選按「建立授權請求」。
5. 在授權中心按「核准」或「拒絕」。
6. 檢查 `data/agent-approvals.json` 是否保留紀錄。

## 停損條件

- 授權請求 24 小時未處理，自動轉為 expired。
- 不是 pending 的請求不可再次被核准或拒絕。
- V4 只記錄授權，不進行外部系統實際執行。
