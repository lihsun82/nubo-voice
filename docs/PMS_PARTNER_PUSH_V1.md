# NUBO PMS 推送 API v1

本規格供 PMS 夥伴串接 **AINUBO 台中錦新館**。PMS 是唯一真實資料來源；NUBO 第一階段只接收定期快照並提供唯讀查詢，不會建立訂單、付款、辦理入住或改房價。

## 正式網址與驗證

- 正式推送：`PUT https://nubo.ainubo.com/api/pms/v1/snapshot`
- 狀態檢查：`GET https://nubo.ainubo.com/api/pms/v1/snapshot`
- `Authorization: Bearer <由館方提供的專用 token>`
- `Content-Type: application/json`
- 僅供 PMS 伺服器以 HTTPS 呼叫。請勿把 token 放在瀏覽器、平板、網址或公開程式碼。
- 館別代碼固定為 `ainubo-taichung-jinxin`，其他館別會被拒絕。
- 正式 token 尚需由館方透過安全管道交付。未設定 token 時 API 回 `503 pms_not_configured`。

## 推送格式

每次 `PUT` 是**完整取代**快照。建議每 5 至 15 分鐘推送一次，且更新時間 `generatedAt` 應是 PMS 真正取得資料的時間。超過 60 分鐘未更新時，NUBO 會停止把資料當成即時資訊。可由館方設定 `NUBO_PMS_MAX_AGE_MINUTES` 調整。

```json
{
  "propertyId": "ainubo-taichung-jinxin",
  "generatedAt": "2026-11-15T20:00:00+08:00",
  "availability": [
    {
      "checkIn": "2026-12-01",
      "checkOut": "2026-12-02",
      "adults": 2,
      "roomTypes": [
        { "code": "DBL", "name": "雙人房", "availableCount": 2 }
      ]
    }
  ],
  "reservations": [
    {
      "bookingReference": "TEST-12345",
      "surname": "王",
      "status": "confirmed",
      "stayStatus": "not_checked_in",
      "checkIn": "2026-12-01",
      "checkOut": "2026-12-02",
      "roomTypeName": "雙人房"
    }
  ]
}
```

上例僅是**格式示例**，不是本館真實房型、房況或訂單。正式資料請由 PMS 提供。請只送仍需查詢的有效或近期訂單，勿送姓名全名、電話、Email、付款、證件或備註。NUBO 收到後只保存「訂單編號＋姓氏」的 HMAC 查詢雜湊及最少狀態欄位；原始編號與姓氏不寫入快照。

- `status`：`confirmed`、`cancelled`、`no_show`
- `stayStatus`：`not_checked_in`、`checked_in`、`checked_out`、`cancelled`、`no_show`
- 日期：`YYYY-MM-DD`；時間：帶時區的 ISO 8601。
- 最多 180 組房況、3000 筆訂單、1 MB JSON；同一批資料不可有重複的「訂單編號＋姓氏」。
- 舊於現有 `generatedAt` 的快照回 `409 outdated_snapshot`，避免舊批次覆蓋新資料。
- 成功回 `200`、`ok: true`、館別、更新時間及筆數。

## NUBO 唯讀查詢

下列路由供已配對的 NUBO 平板、登入後台的管理員，或持同一專用 Bearer token 的 PMS 伺服器呼叫。所有回應均 `Cache-Control: no-store`。

- `POST /api/pms/v1/availability`：`{"checkIn":"2026-12-01","checkOut":"2026-12-02","adults":2}`
- `POST /api/pms/v1/reservation`：`{"bookingReference":"TEST-12345","surname":"王"}`

房況回 `covered:true` 代表快照涵蓋該日期與人數，並回傳房型可售數量；`covered:false` 代表**資料未涵蓋**，不可當成售罄。訂單回 `matched:false` 不透露是否存在相似編號。符合時只回狀態、日期、房型與資料時間，不回傳旅客個資。超過時效或尚未有快照一律回 `503 pms_data_unavailable`；訂單查詢限每來源每分鐘 10 次。

## PMS 夥伴交接

1. 提供 PMS 系統名稱與負責工程師聯絡方式。
2. 確認本館 PMS 館別代碼、房型代碼和上述訂單狀態的對照表。
3. 用**假資料**推送測試快照，再測試房況、正確訂單、錯誤姓氏、舊快照及中斷推送情境。
4. 確認正式推送頻率、錯誤重試與 token 輪替窗口。

真正的入住與房價操作需另開權限與流程，不屬於此唯讀版本。
