# NUBO 現場語音查房｜401 授權修正

## 背景
飯店自有 Android NUBO 語音設備上的訪客不應為查詢可售房間數量而登入、配對或輸入管理員 Token。2026/11/22 Railway 在 POST /api/pms/v1/availability 記錄 HTTP 401；同時 GET /api/guest-config 也為 401，兩者屬不同授權範圍。本修正只針對房型可售數量 API，不改 guest-config 或其他管理 API。

## 已開放的最小唯讀邊界
- 僅 POST /api/pms/v1/availability 與 /api/pms/v1/rest-availability。
- 只處理由 NUBO 正式網域 `https://nubo.ainubo.com` 同源網頁發出的 guest-room-types-v1 查詢；此網域不可被 Railway 的 `NUBO_PUBLIC_URL` 其他部署別名替換。瀏覽器需有允許的 Origin 或可信的同源 Fetch Metadata + Referer。
- 只能回傳 PMS 即時有效的房型名稱、代碼、availableCount 等唯讀房況資料，禁止使用過期快照或缺失的房型目錄代替即時資料。
- PMS Bearer Token 僅放在 Railway 伺服器環境，由 NUBO 後端轉呼叫 PMS；不會出現在網頁或 APP。
- 匿名查房每來源 60 秒最多 30 次，超過回 HTTP 429；同時仍保留輸入驗證、4 秒逾時、no-store、房況過期拒絕。這是單副本記憶體限流；未來多副本需共享限流。

## 絕對不變更
- POST /api/pms/v1/reservation：仍需原本登入／設備授權或專用 Bearer。
- GET /api/guest-config：仍需登入或設備配對。
- PMS 推送 PUT/GET、管理 API、訂房新增、改價、付款、入住、發卡等權限都保持不變。

## 安全性說明
這個變更刻意將「房型可售數量」視為可供訪客查詢的公開銷售資訊，而非私有房務資料。Origin、Referer、Sec-Fetch-Site 只能保護正常瀏覽器呼叫，並不是不能偽造的設備身分。外部伺服器可偽造 HTTP 標頭；因此不得將這套授權方式用於訂單、旅客個資、管理或任何寫入 API。

## 發布與驗收
先通過 TS 編譯、Next build、模擬 PMS 有效/失敗/空房型結果、跨來源拒絕、訂單仍 401、每來源限流等測試。正式發布後須以飯店 NUBO 裝置查詢住宿及休息，確認 HTTP 401 不再發生且 PMS 回傳正確可售數量；若返回 503 則檢查 PMS 上游資料是否完整，不要自動稱客滿。
