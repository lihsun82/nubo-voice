# NUBO Desktop Actions v0.5

## YouTube自動播放修正

播放器不再只依賴網址的 `autoplay=1`。新版會：

1. 載入YouTube IFrame Player API。
2. 等待播放器觸發onReady。
3. 設定音量100、解除靜音並呼叫loadVideoById及playVideo。
4. 在200、700、1500、3000及5000毫秒自動重試。
5. 若YouTube回報autoplay blocked，繼續重試並顯示「立即播放」備援按鈕。
6. 專用Chrome或Edge視窗仍使用獨立資料夾及autoplay policy，不影響一般瀏覽器設定。

更新後請完全關閉舊的NUBO Music Player視窗，再重新語音播放。

## 網頁開啟

語音範例：

```text
NUBO，開啟Facebook。
```

```text
NUBO，幫我開啟Gmail網頁。
```

```text
NUBO，開啟https://www.booking.com。
```

```text
NUBO，搜尋台南中西區飯店。
```

內建別名包含Facebook、Google、Gmail、YouTube、YouTube Music、ChatGPT、Google Maps及Google Calendar。指定合法網域或HTTP/HTTPS網址時會直接開啟；其他文字會改用Google搜尋。

系統拒絕file、javascript、shell及其他非HTTP/HTTPS協定。

## Windows工具

語音範例：

```text
NUBO，開啟計算機。
```

```text
NUBO，開啟記事本。
```

```text
NUBO，開啟小畫家。
```

```text
NUBO，開啟檔案總管。
```

```text
NUBO，開啟Windows設定。
```

```text
NUBO，開啟時鐘。
```

桌面工具採固定白名單，不接受任意程式路徑、PowerShell命令或命令列參數。

## 更新與測試

```powershell
Set-Location C:\nubo-voice
git pull origin main
npm.cmd install
npm.cmd run dev
```

開啟：

```text
http://127.0.0.1:3000
```

在「工具與帳號整合」可使用：

- 測試自動播放
- 測試開啟Facebook
- 測試開啟計算機

## YouTube設定

`.env.local`需要：

```env
YOUTUBE_API_KEY=你的YouTube Data API v3金鑰
NUBO_PUBLIC_URL=http://127.0.0.1:3000
```

修改後必須重新啟動NUBO。
