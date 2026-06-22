# NUBO Actions v0.4 設定

## 已加入的工具

- 立即研究與解方比較
- YouTube及YouTube Music搜尋與自動播放
- Gmail搜尋、讀取全文與摘要
- Gmail建立草稿
- Gmail兩階段確認寄送
- 定時Gmail摘要
- 排程結果建立郵件草稿
- 白名單收件者自動寄送

## Google Cloud設定

1. 建立或選擇Google Cloud專案。
2. 啟用Gmail API。
3. 啟用YouTube Data API v3。
4. 設定OAuth同意畫面。
5. 應用程式在測試階段時，把自己的Google帳號加入Test users。
6. 建立OAuth Client，類型選Web application。
7. Authorized redirect URI加入：

```text
http://127.0.0.1:3000/api/google/oauth/callback
```

8. 建立一組API Key，限制只允許YouTube Data API v3，供NUBO把歌曲名稱搜尋成影片ID。

## `.env.local`新增設定

以下內容只放在 `C:\nubo-voice\.env.local`，不可提交GitHub：

```env
GOOGLE_CLIENT_ID=貼上OAuth Client ID
GOOGLE_CLIENT_SECRET=貼上OAuth Client Secret
GOOGLE_REDIRECT_URI=http://127.0.0.1:3000/api/google/oauth/callback

YOUTUBE_API_KEY=貼上限制為YouTube Data API v3的API Key
NUBO_PUBLIC_URL=http://127.0.0.1:3000

NUBO_EMAIL_AUTOSEND=false
NUBO_EMAIL_ALLOWLIST=
```

預設 `NUBO_EMAIL_AUTOSEND=false`。即時寄信仍採預覽及確認。

要允許排程自動寄信，設定：

```env
NUBO_EMAIL_AUTOSEND=true
NUBO_EMAIL_ALLOWLIST=lihsun82@gmail.com,another-approved@example.com
```

只有完全符合白名單的收件者才會自動寄出；其他收件者會改為建立Gmail草稿。

## YouTube自動播放

NUBO不再只打開YouTube搜尋頁。流程改為：

1. 使用YouTube Data API搜尋第一個可嵌入影片。
2. 開啟NUBO專用播放器頁面。
3. 在Windows上使用獨立Chrome或Edge應用程式視窗。
4. 只對這個專用視窗使用 `--autoplay-policy=no-user-gesture-required`。
5. 不修改日常Chrome或Edge的全域設定。

第一次啟動會在 `data/youtube-autoplay-profile` 建立獨立瀏覽器資料夾。該資料夾不會提交到GitHub。

如果Chrome或Edge找不到，NUBO會改用預設瀏覽器開啟播放器；這種模式可能仍需要第一次手動按播放。

## 連接Gmail

1. 啟動NUBO。
2. 使用 `http://127.0.0.1:3000` 開啟頁面。
3. 在「工具與帳號整合」按「連接Gmail」。
4. 登入Google並同意權限。
5. 回到NUBO確認顯示「已連接」。

## 語音範例

```text
NUBO，幫我研究台南中西區新旅館最適合的定價策略，找出可執行方案。
```

```text
NUBO，我想聽周杰倫的晴天，用YouTube Music播放。
```

```text
NUBO，找出今天所有未讀的重要郵件並念摘要給我。
```

```text
NUBO，讀取剛才搜尋結果的第一封郵件。
```

```text
NUBO，寫一封給someone@example.com的郵件，主旨是會議確認，內容說明明天下午三點見，先建立草稿。
```

```text
NUBO，準備把剛才的郵件寄出。
```

NUBO覆誦預覽後，再說：

```text
確認寄出。
```

## 排程工作流範例

```text
NUBO，每天早上九點搜尋最近一天未讀郵件，整理待辦與優先順序，結果放進NUBO收件匣。
```

```text
NUBO，每天下午六點整理今天收到的重要郵件，建立一封Gmail草稿寄給lihsun82@gmail.com。
```

```text
NUBO，每天早上八點研究台灣旅館業重要新聞，寄到白名單信箱。
```

## Gmail搜尋語法範例

- `is:unread newer_than:1d`
- `from:someone@example.com`
- `subject:invoice newer_than:7d`
- `has:attachment newer_than:30d`
- `in:inbox is:important`

## 安全邊界

- 讀信與建立草稿可直接執行。
- 即時正式寄信必須先預覽，再明確確認。
- 排程自動寄信需要同時開啟autosend及收件者白名單。
- YouTube自動播放只在NUBO專用瀏覽器視窗放寬，不修改全域瀏覽器設定。
- 付款、轉帳、刪除資料、改價、取消訂單及正式PMS操作仍禁止自動執行。
