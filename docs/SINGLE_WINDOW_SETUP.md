# NUBO v0.7 單一視窗

## 主科技球

中央球體為即時Canvas動畫，包含720個流動粒子、紫藍能量核心、能量軌跡、內部光線與掃描光帶。球體會依待命、連線、聆聽、思考、說話與錯誤狀態改變速度、亮度與脈衝。

全頁背景只保留深色漸層及低調網格，不再顯示第二顆球體。

## 網頁

Facebook、Gmail、Google Maps及指定網站會在目前NUBO分頁開啟，不建立額外動作視窗。開啟外部網站後，可使用瀏覽器返回回到NUBO。

## YouTube

YouTube只使用NUBO右下角播放器。播放器會先啟動影片，再解除靜音並重試播放。正式使用時請以NUBO專用啟動器開啟單一Chrome或Edge App視窗。

## 啟動

```powershell
Set-Location C:\nubo-voice
git pull origin main
npm.cmd install
npm.cmd run app
```

此命令會建置最新版、啟動伺服器、關閉舊的NUBO專用視窗，並只開一個新的NUBO App視窗。

## 測試語音

```text
NUBO，播放周杰倫的晴天。
```

```text
NUBO，開啟Facebook。
```
