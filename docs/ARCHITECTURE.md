# NUBO Voice 架構

## 邊界

NUBO Voice 是獨立的語音與任務協調層，不承載旅館爬蟲本體。

```text
使用者語音
  ↓
NUBO Voice（理解、權限、工具選擇）
  ↓
Skills / Adapters（受控 API）
  ├─ Gmail
  ├─ Google Calendar
  ├─ LINE / LINE WORKS
  ├─ Scheduler
  └─ AinuboX1 Adapter ──API──> AinuboX1
```

## 不混用原則

1. 不複製 AinuboX1 原始碼到本專案。
2. 不共用 Secrets。
3. 不共用正式資料庫。
4. 只透過版本化 API 或 GitHub Actions `workflow_dispatch` 溝通。
5. NUBO 只能取得完成任務所需的最小權限。

## 建議演進

### v0.1
- 即時語音
- 追蹤需求草稿
- 權限政策

### v0.2
- Supabase 任務資料庫
- 持久化 Scheduler Worker
- LINE 通知

### v0.3
- Gmail / Calendar OAuth
- AinuboX1 Adapter
- 二次確認與稽核紀錄

### v1.0
- 手機 App
- 喚醒詞
- 多代理協作
- 完整監控與成本控管
