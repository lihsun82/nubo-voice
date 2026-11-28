# nubosci 小兔 × NUBO Voice 即時查房

PMS 正式規格來自館方交付的 `NUBO_VOICE_AVAILABILITY.md`。只服務
`ainubo-taichung-jinxin`，台灣時區 `Asia/Taipei`。

## NUBO Voice 伺服器設定

| 變數 | 值 |
|---|---|
| `NUBO_PMS_AVAILABILITY_URL` | `https://pms.ainubohub.com/api/voice/v1/availability` |
| `NUBO_PMS_REST_AVAILABILITY_URL` | `https://pms.ainubohub.com/api/voice/v1/rest-availability` |
| `NUBO_PMS_AVAILABILITY_TOKEN` | PMS 專用唯讀憑證，僅存在 NUBO Voice 伺服器 |
| `NUBOSCI_PMS_VOICE_TOOLS_ENABLED` | nubosci 前台已能回傳兩個工具結果後才設為 `true` |

請由有權限的 PMS 管理員把查房憑證安全注入 NUBO Voice 伺服器環境，
勿放在 iPad、前台程式、Gemini 提示詞或 GitHub。

## nubosci 前台與同站後端

NUBO Voice 的 `POST /api/partners/nubosci/v1/voice-session` 在功能開啟後，
會把下列 Gemini Live 工具鎖定在一次性通話憑證中：

- `pms_check_stay_availability({checkIn,checkOut,adults})`
- `pms_check_rest_availability({startAt,durationMinutes})`

nubosci 前台收到 `toolCall.functionCalls` 後，應把參數送到**nubosci 自己的同站後端**；
由該後端使用現有的 nubosci 夥伴 Bearer 呼叫 NUBO Voice：

- `POST https://nubo.ainubo.com/api/partners/nubosci/v1/availability`
- `POST https://nubo.ainubo.com/api/partners/nubosci/v1/rest-availability`

請求 JSON 加入固定 `propertyId:"ainubo-taichung-jinxin"`，其餘欄位照工具參數。
**夥伴 Bearer 只留在 nubosci 後端，不可下發瀏覽器或 iPad。**
前台收到結果後，使用原始 function call 的 `id`、`name` 回送 Gemini
`session.sendToolResponse({functionResponses:[{id,name,response:{result}}]})`。
工具錯誤也要回送結果，避免語音會話停在等待工具。
若前台直接使用 WebSocket，回送格式為
`{"toolResponse":{"functionResponses":[{"id":"...","name":"...","response":{"result":{...}}}]}}`。
可參考 [Google 官方 Live API WebSocket 範例](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket?hl=zh-tw)。
查詢期間暫停送麥克風資料，待工具回應後再恢復，以免語音與工具結果交錯。

住宿 API 的成功結果含 `roomTypes`，其中 `availableCount=0` 才是確定無房。
若 PMS 回 `503 room_catalogue_incomplete`，NUBO Voice 代理原樣保留該安全原因碼；
小兔說「目前無法確認住宿房況，請洽櫃檯」，不得說客滿。
休息結果含 `startAt`、`durationMinutes`、`availableCount`；
播報未來時段時須說清楚時間。兩種結果只接受五分鐘內的 `asOf`。

## NUBO 語音櫃檯設備查房

NUBO 主站的住宿與休息查房可傳 `requiredAmenities`。語音伺服器將
`["bidet"]` 換為 `floors:[7,8]`，`["bathtub"]` 或兩項皆需時換為
`floors:[8]`。需要 PMS 支援 `X-Nubo-Inventory-View: guest-room-types-by-floor-v1`，
以相同館別、日期及入住人數或休息時段篩選實體房後，回傳相符的 `floors`、
`inventoryView` 及彙總 `roomTypes`。包含可售數為零的房型，讓 NUBO 能區分無房與資料缺漏。
尚未提供樓層結果時回報無法確認並顯示聯絡卡。憑證、回應欄位與權限仍限唯讀房型存量。

### 客房照片的樓層

在可售的 `roomTypes[]` 項目中，PMS 可回傳 `photoFloor`（例如 `"6F"`）或實際樓層。若 PMS 回傳 `roomNumber: "601"`，NUBO 伺服器只把 `photoFloor: "6F"` 傳給語音與相簿。多個可售房間跨樓層時，須以 PMS 明確推薦的房間為準。只有房型總數時，相簿讓旅客選擇樓層。已核對的訂單也可透過原有的 PMS 快照提供同一欄位。

## 驗收

1. 先以合成回應測試兩支代理、資料逾時、錯誤、確定 0 間與
   `room_catalogue_incomplete`。
2. nubosci 前台完成工具呼叫與結果回送後，才啟用
   `NUBOSCI_PMS_VOICE_TOOLS_ENABLED=true`。
3. 在**櫃檯 iPad** 實測「明天上午十點休息兩小時，還有幾間？」及
   「兩位大人明天入住、後天退房，還有房嗎？」；記錄實際 tool call、
   PMS HTTP 狀態、工具結果及小兔播報。不得以後端合成測試冒稱 iPad 實測。
