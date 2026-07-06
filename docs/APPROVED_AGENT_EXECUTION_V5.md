# NUBO Approved Agent Execution V5

第五階段目標：讓第四階段已核准的外部代理人授權請求，進入受控執行流程，並保留 execution record。

## 核心原則

V5 不是全面開放外部系統操作，而是先建立「核准後才可執行」的安全通道。

```text
外部代理人候選
↓
建立授權請求
↓
使用者核准
↓
POST /api/agent-executions
↓
執行器檢查狀態與風險
↓
live 或 dry-run
↓
寫入 data/agent-executions.json
↓
送到 NUBO 收件匣
```

## 新增檔案

- `lib/approved-agent-execution.ts`
- `app/api/agent-executions/route.ts`
- `docs/APPROVED_AGENT_EXECUTION_V5.md`

## 執行規則

### Live execution

目前只有符合以下條件才會 live：

```text
approval.status === approved
handoff.status === available
handoff.agentId === document-artifact-adapter
riskLevel === L1 或 L2
```

Live 內容：

- 建立 Markdown / HTML / JSON artifact
- 寫入 `data/artifacts/`
- 寫入 `data/artifacts.json`
- 寫入 NUBO 收件匣
- 寫入 execution record

### Dry-run execution

以下狀況一律 dry-run 或 blocked：

- 授權狀態不是 approved
- Adapter 是 `planned`
- Adapter 是 `needs_config`
- Adapter 是 `disabled`
- 任務風險為 L3 / L4
- 不是 Document Artifact Adapter

Dry-run 會產生：

- 代理人名稱
- 風險等級
- 已核准範圍
- 禁止動作
- 阻止原因
- 下一步

但不會操作外部系統。

## API

### `GET /api/agent-executions`

讀取最近執行紀錄。

### `POST /api/agent-executions`

Request:

```json
{
  "approvalId": "approval-id"
}
```

Response:

```json
{
  "ok": true,
  "execution": {
    "mode": "live",
    "status": "success",
    "artifactIds": ["..."]
  }
}
```

## 本機資料

執行紀錄寫入：

```text
data/agent-executions.json
```

可交付檔案寫入：

```text
data/artifacts/
data/artifacts.json
```

## 前台功能

Task Center 已升級為：

```text
TASK ORCHESTRATOR V5
AGENT APPROVAL CENTER
AGENT EXECUTION CENTER
```

授權中心新增：

- approved 請求可按「執行核准代理人」

執行中心新增：

- execution status
- execution mode
- blocked reason
- artifact count

## 安全邊界

V5 仍禁止：

- 自動授權未知外部代理人
- 自動讀取 Secrets / API Keys / Token
- 自動改 DNS / 金流 / 法律文件
- 自動部署
- 自動合併 PR
- 自動寄非白名單 Email
- 修改 LINE 控制穩定版相關檔案
- 對 `planned` / `needs_config` Adapter 做真實外部執行

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
幫我產出一份 NUBO 測試報告，請建立 HTML 檔案。
```

3. 點擊「先拆解任務」。
4. 找到 Document Artifact Adapter。
5. 點擊「建立授權請求」。
6. 在授權中心按「核准」。
7. 按「執行核准代理人」。
8. 檢查：

```text
data/agent-executions.json
data/artifacts/
NUBO 收件匣
```

## 停損條件

- approval 不是 approved，不執行。
- 不是 available Document Artifact Adapter，只 dry-run。
- L3/L4 一律不 live。
- Artifact 寫入失敗時，API 應回錯，不得假裝成功。
