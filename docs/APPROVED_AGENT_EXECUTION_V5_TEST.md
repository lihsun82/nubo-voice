# Phase 5 Smoke Test Checklist

## Build

```bash
npm run typecheck
npm run build
npm run dev
```

## Manual flow

1. Open Task Center.
2. Enter a low-risk document task:

```text
幫我產出一份 NUBO 測試報告，請建立 HTML 檔案。
```

3. Click `先拆解任務`.
4. Confirm `Document Artifact Adapter` appears as an external handoff candidate.
5. Click `建立授權請求`.
6. In Agent Approval Center, click `核准`.
7. Click `執行核准代理人`.
8. Confirm Agent Execution Center shows `success` and mode `live`.
9. Confirm NUBO Inbox has an execution result with artifact links.
10. Confirm local files exist:

```text
data/agent-approvals.json
data/agent-executions.json
data/artifacts/
data/artifacts.json
```

## Dry-run flow

1. Create and approve a `planned` or `needs_config` adapter request.
2. Click `執行核准代理人`.
3. Confirm Agent Execution Center shows `blocked` and mode `dry_run`.
4. Confirm no external system was changed.
