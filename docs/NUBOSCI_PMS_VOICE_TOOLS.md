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

## 驗收

1. 先以合成回應測試兩支代理、資料逾時、錯誤、確定 0 間與
   `room_catalogue_incomplete`。
2. nubosci 前台完成工具呼叫與結果回送後，才啟用
   `NUBOSCI_PMS_VOICE_TOOLS_ENABLED=true`。
3. 在**櫃檯 iPad** 實測「明天上午十點休息兩小時，還有幾間？」及
   「兩位大人明天入住、後天退房，還有房嗎？」；記錄實際 tool call、
   PMS HTTP 狀態、工具結果及小兔播報。不得以後端合成測試冒稱 iPad 實測。
