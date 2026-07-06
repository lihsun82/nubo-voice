# NUBO External Agent Gateway V3

第三階段目標：讓 NUBO 能判斷什麼任務需要外部 Agent / Adapter 補強，但仍維持白名單、授權、風險分級與可驗收交付。

## 核心原則

第三階段不是讓 AI 無限制外搜代理人，而是建立外部代理人閘道：

```text
任務輸入
↓
內部代理人拆解
↓
外部代理人白名單比對
↓
產生 handoff 候選
↓
低風險可由既有 Adapter 處理；需要授權者只產生建議
↓
交付到 NUBO 收件匣
```

## 新增檔案

- `lib/external-agent-gateway.ts`
- `app/api/external-agents/route.ts`
- `docs/EXTERNAL_AGENT_GATEWAY_V3.md`

## 外部代理人白名單

目前白名單候選：

| Agent / Adapter | 狀態 | 用途 |
|---|---|---|
| GitHub Coding Adapter | needs_config | repo 檢查、分支計畫、PR 草稿 |
| Hotel Radar Adapter | planned | 房價雷達、競品快照、定價摘要 |
| Browser Research Adapter | planned | 即時研究、來源交叉檢查 |
| Document Artifact Adapter | available | Markdown / HTML / JSON 檔案交付 |
| Gmail Calendar Adapter | needs_config | Gmail 草稿、白名單寄送、Calendar 計畫 |
| Home Assistant Device Adapter | needs_config | 智慧家庭與設備控制計畫 |

## API

### `GET /api/external-agents`

列出目前白名單外部代理人。

### `POST /api/external-agents`

Request:

```json
{
  "instruction": "幫我修 GitHub workflow 並產生 PR 草稿",
  "internalAgents": ["planner", "coding", "qa"],
  "riskLevel": "L3"
}
```

Response:

```json
{
  "ok": true,
  "handoffs": [
    {
      "agentId": "github-coding-adapter",
      "agentName": "GitHub Coding Adapter",
      "requiresApproval": true
    }
  ],
  "policy": {
    "mode": "allowlist_only",
    "highRisk": "manual_confirmation_required"
  }
}
```

## Orchestrator 整合

`createOrchestratorPlan()` 現在會附加：

```ts
externalHandoffs: ExternalAgentHandoff[]
```

任務建立後，執行器會把外部代理人候選寫入任務內容。若候選需要授權，NUBO 只能輸出建議、授權範圍與下一步，不會宣稱已執行。

## 安全邊界

第三階段仍禁止：

- 未知外部代理人自動取得權限
- 讀取、輸出或提交 Secrets / API Keys / Token
- 自動改 DNS / 金流 / 法律文件送出
- 自動部署
- 自動合併 PR
- 自動寄送非白名單收件者
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
2. 在任務指揮中心輸入：

```text
幫我整理明天新寶智慧一中館房價雷達，產出 HTML 報告，並判斷是否需要外部代理人補強。
```

3. 點擊「先拆解任務」。
4. 確認畫面出現外部代理人候選。
5. 點擊「建立一次性任務」。
6. 檢查 NUBO 收件匣是否列出候選代理人、可輸出內容、禁止動作與檔案連結。

## 停損條件

- 任何 L3/L4 任務只產生計畫，不進入自動執行。
- 需要設定環境變數的 Agent 狀態為 `needs_config`，不可直接視為已啟用。
- planned Agent 只可作為候選，不可宣稱已完成外部資料抓取。
