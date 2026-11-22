# NUBO｜雅婷台語女聲 1 / 2 A/B 試音（未導入正式系統）

**目標**：比較 `tai_female_1`（雅婷）與 `tai_female_2`（意晴）的「臺灣台語腔口、聲調、自然度與回應時間」，不是比較華語配音。

## 官方確認的 API
- 來源：<https://developer.yating.tw/zh-TW/doc/tts-TTS%20%E8%AA%9E%E9%9F%B3%E5%90%88%E6%88%90v2>
- `POST https://tts.api.yating.tw/v2/speeches/short`
- Header：`key: <專用 API Key>`、`Content-Type: application/json`。
- 使用 `LINEAR16` / `16K`；女聲模型：`tai_female_1`、`tai_female_2`。
- 語速、音高、能量都固定 `1.0`，避免調音參數影響 A/B 比較。
- 一次只送一個短句，總計 2 或 6 次 API 呼叫，屬付費／試用額度內的外部呼叫。

## 實際要如何產生試聽音檔
1. 到 <https://developer.yating.tw/> 建立雅婷開發者帳戶並取得 API Key。
2. 在 GitHub 專案 `lihsun82/nubo-voice` 的 **Settings → Secrets and variables → Actions → New repository secret**，名稱填 `YATING_API_KEY`，值貼官方提供的 API Key。**不要放在 ChatGPT、GitHub 檔案、PR 或公開訊息中**。
3. 打開 GitHub Actions 裡 **Yating Taiwanese A/B audition (manual)**，按 **Run workflow**，選擇先測 1 句（2 次合成）或完整 3 句（6 次合成）。
4. 執行完成後，進入該次工作流程的 **Artifacts**，取得 `NUBO-Yating-Taigi-A-B` ZIP，內含每句的 A 與 B WAV，以及 `README_試聽說明.md`、`results.json`。
5. 用同一支手機、相同音量與距離交替聽 A / B，確認是否像臺灣本地台語腔，再決定是否測試串接。

## 三組測試內容
| 試聽場景 | 同一份台語文字 |
|---|---|
| 迎賓 | 你好，歡迎來新寶智慧酒店。恁今仔日欲住宿，抑是欲休息？ |
| 查房 | 恁是兩个人欲住一暝，著無？我來共恁看覓有空房無。 |
| 替代房型 | 歹勢，這款房間這馬無空房。咱閣有別款房間，恁欲參考看覓無？ |

這三句是 A/B 測試用文字，尚未由臺語專業語言編輯審校；若供應商朗讀不清，需區分「文本無法辨識」與「聲線本身有國語腔」。不代表飯店實際可售房況。

## 驗收與停損
- 腔調聲調自然：40%；咬字可懂程度：30%；旅館親切感：20%；API 回應時間：10%。以上是評估權重，不是預設得分。
- **任一聲線出現明顯中國閩南腔、國語讀台語或難以理解台語**，不得直接部署到正式 NUBO。
- API latency 只是單次合成時間；需再測試真人語音對話總延遲和打斷發話行為。
- 若 API 回 401、422、5xx，不視為聲線差；應先核對憑證／額度／API 文件。
- 產生的語音不應包含真實住客姓名、電話、付款、訂單、房價或房況。
- 本次只測試雅婷第三方 TTS，**不修改** NUBO 正式 Gemini Live、PMS 或 LINE 設定。

## 直接在有金鑰的本機執行
```bash
export YATING_API_KEY='請改成自己安全保管的金鑰'
python3 -m unittest discover -s tests -p 'test_yating_taigi_ab.py' -v
python3 scripts/yating-taigi-ab.py --samples 1 --output yating-taigi-ab-output
```

若未設金鑰，程式只會提示缺少憑證，不會偽造聲音。
