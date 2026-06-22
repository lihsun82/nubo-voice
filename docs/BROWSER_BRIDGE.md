# NUBO Browser Bridge v0.6

## 為什麼重做

舊版透過Next.js伺服器啟動外部瀏覽器程序。這種方式在Windows、Chrome自動播放政策與瀏覽器彈出式視窗限制下不穩定。

新版改為：

- YouTube直接在NUBO主頁右下角播放器播放。
- 使用者按下「啟動NUBO」時，同步建立一個專用網頁動作視窗。
- 後續語音指令只導航這個已取得權限的視窗。
- Windows工具仍經由固定白名單API啟動。

## YouTube流程

1. 啟動NUBO時初始化主頁播放器。
2. 語音說出歌曲或影片。
3. NUBO使用YouTube Data API取得可嵌入影片ID。
4. 主頁播放器呼叫loadVideoById、解除靜音、設定音量並播放。
5. 若尚未播放，播放器會在多個時間點重試。
6. 使用者仍可在右下角播放器按「播放」或「停止」。

## 網頁流程

按下「啟動NUBO」後會開啟NUBO ACTION WINDOW。請允許 `127.0.0.1:3000` 的彈出式視窗並保持該視窗開啟。

語音範例：

```text
NUBO，開啟Facebook。
NUBO，開啟Gmail。
NUBO，開啟booking.com。
NUBO，搜尋台南飯店。
```

## 動態背景

背景採用原生Canvas即時繪製紫藍霓虹粒子球，不使用上傳影片中的浮水印素材。背景會依語音狀態改變：

- 待命：緩慢流動
- 連線：亮度提高
- 聆聽：粒子加速
- 思考：能量聚集
- 回覆：亮度與脈衝最強
- 錯誤：亮度降低

## 更新

```powershell
Set-Location C:\nubo-voice
git pull origin main
npm.cmd install
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm.cmd run dev
```

開啟：

```text
http://127.0.0.1:3000
```

第一次按「啟動NUBO」時，瀏覽器可能詢問麥克風與彈出式視窗權限，兩者都需要允許。
