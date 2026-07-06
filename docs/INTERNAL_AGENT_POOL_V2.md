# NUBO Internal Agent Pool V2

第二階段目標：讓第一階段產生的任務計畫，不只停留在拆解，而是能由固定內部代理人逐步執行，並在需要時產生本機檔案下載連結。

## 核心變更

1. 固定內部代理人池
2. 任務步驟解析器
3. 逐步執行器
4. 本機 Artifact 產出
5. Artifact 下載 API

## 固定內部代理人

| 代理人 | 職責 |
|---|---|
| Planner Agent | 拆任務、定義成功條件、停損條件 |
| Research Agent | 蒐集資料、標示來源、指出資訊缺口 |
| Data Agent | 轉成表格、公式、營運指標 |
| Report Agent | 產出可交付報告與檔案內容 |
| Mail Agent | 草稿、主旨、交付摘要 |
| Coding Agent | 程式分析、受影響檔案、測試方式 |
| QA Agent | 驗收、缺口、風險、下一步 |
| Device Agent | 白名單桌機與設備控制規劃 |

## 執行流程

```text
使用者輸入任務
↓
/api/orchestrator 產生代理人計畫
↓
建立 L1/L2 一次性任務
↓
/api/tasks/action 執行任務
↓
executeInternalAgentPlan 逐步呼叫內部代理人
↓
交付到 NUBO 收件匣
↓
必要時產出 Artifact 下載連結
```

## Artifact 檔案

目前支援：

- Markdown：`.md`
- HTML：`.html`
- JSON：`.json`

下載 API：

```text
GET /api/artifacts/{artifactId}
```

檔案會寫入本機：

```text
data/artifacts/
data/artifacts.json
```

HTML 檔可用瀏覽器開啟後列印為 PDF。暫不直接新增 PDF 套件，避免增加 build 風險與本機依賴。

## 安全邊界

第二階段仍然禁止：

- 未知外部代理人自動搜尋
- 未授權外部代理人取得資料
- 自動改 DNS / 金流 / Secrets
- 自動部署
- 自動寄送非白名單 Email
- 修改 LINE 控制穩定版相關檔案

保護範圍延續第一階段：

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

手動測試建議：

1. 開啟首頁。
2. 在任務指揮中心輸入：

```text
幫我整理一份新寶智慧一中館明日營運待辦，請產出報告與 HTML 檔案。
```

3. 點擊「先拆解任務」。
4. 確認 riskLevel 為 L2。
5. 點擊「建立一次性任務」。
6. 等 30 秒內自動執行或點擊任務的「立即執行」。
7. 檢查 NUBO 收件匣是否出現代理人逐步輸出與檔案下載連結。

## 停損條件

- 任一代理人執行失敗，整個 task run 記錄 failed。
- L3/L4 任務只產生計畫，不自動建立執行任務。
- 若 Artifact 寫入失敗，任務應顯示錯誤，不得假裝產檔完成。
