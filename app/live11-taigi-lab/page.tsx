"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

type Status = "idle" | "connecting" | "connected" | "error";
type Score = { recognition: string; accent: string; note: string };
const QUESTIONS = [
  { topic: "住宿房況", taigi: "今仔日兩位欲住宿，閣有雙人房無？", zh: "今天兩個人住宿，還有雙人房嗎？" },
  { topic: "住宿價格", taigi: "兩个人欲蹛一暝，一暝偌濟錢？", zh: "兩個人住一晚多少錢？" },
  { topic: "休息兩小時", taigi: "我欲歇睏兩點鐘頭，按怎算錢？", zh: "休息兩小時如何計費？" },
  { topic: "提早入住", taigi: "會當提早入房無？", zh: "可以提早入住嗎？" },
  { topic: "其他房型", taigi: "雙人房若無，閣有啥物房通蹛？", zh: "沒有雙人房還有其他房型嗎？" },
  { topic: "日常聊天", taigi: "你食飽未？今仔日欲食啥物？", zh: "吃飽沒？今天想吃什麼？" },
];
const MAX_SECONDS = 120;

function timestamp() { return new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }); }
function styleButton(disabled = false): CSSProperties {
  return { background: disabled ? "#c7cbcf" : "#326a60", color: "#fff", border: 0,
    borderRadius: 8, fontSize: 16, padding: "12px 16px", cursor: disabled ? "not-allowed" : "pointer" };
}
export default function Live11TaigiLab() {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("本頁不查 PMS、不處理訂房，也不發送 LINE。");
  const [seconds, setSeconds] = useState(0);
  const [scores, setScores] = useState<Score[]>(QUESTIONS.map(() => ({ recognition: "", accent: "", note: "" })));
  const [lastModel, setLastModel] = useState("");
  const [transcript, setTranscript] = useState("");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);
  const mountedRef = useRef(true);

  const cleanup = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    intervalRef.current = null;
    timeoutRef.current = null;
    try { channelRef.current?.close(); } catch { /* already closed */ }
    try { peerRef.current?.close(); } catch { /* already closed */ }
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
      audioRef.current.remove();
    }
    channelRef.current = null;
    peerRef.current = null;
    streamRef.current = null;
    audioRef.current = null;
  };

  const stop = (reason = "測試通話已結束。") => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    const channel = channelRef.current;
    if (channel?.readyState === "open") {
      try { channel.send(JSON.stringify({ type: "session.close", event_id: "nubo-taigi-finish" })); }
      catch { /* close transport anyway */ }
    }
    // Close all WebRTC media tracks and the peer; no background microphone.
    cleanup();
    if (mountedRef.current) {
      setStatus("idle");
      setMessage(reason);
    }
    stoppingRef.current = false;
  };

  useEffect(() => {
    mountedRef.current = true;
    const end = () => { cleanup(); };
    window.addEventListener("pagehide", end);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", end);
      cleanup();
    };
  }, []);

  async function begin() {
    if (status === "connecting" || status === "connected" || peerRef.current) return;
    if (pin.trim().length < 20) {
      setStatus("error"); setMessage("請輸入測試授權碼（不是 OpenAI API Key），至少 20 個字元。"); return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error"); setMessage("請使用 HTTPS 網址並允許麥克風。"); return;
    }
    setStatus("connecting");
    setMessage("正在建立安全語音連線…");
    setTranscript("");
    setSeconds(0);
    setLastModel("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      streamRef.current = stream;
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      stream.getTracks().forEach(track => peer.addTrack(track, stream));

      const output = document.createElement("audio");
      output.autoplay = true;
      output.setAttribute("playsinline", "true");
      output.style.display = "none";
      document.body.appendChild(output);
      audioRef.current = output;
      peer.ontrack = event => {
        if (peerRef.current !== peer) return;
        output.srcObject = event.streams[0];
        void output.play().catch(() => setMessage("請點螢幕允許播放聲音。"));
      };

      const events = peer.createDataChannel("oai-events");
      channelRef.current = events;
      events.onmessage = event => {
        try {
          const data = JSON.parse(String(event.data)) as {
            type?: string; text?: string; transcript?: string; delta?: string;
            error?: { message?: string }; response?: { type?: string; [key: string]: unknown };
          };
          if (data.type === "session.started") {
            setStatus("connected");
            setMessage("GPT-Live-1.1 已連接，開始講台語。");
          } else if (data.type === "session.closed") {
            stop("服務已確認結束通話。");
          } else if (data.type === "error") {
            setMessage(data.error?.message || "語音服務回報錯誤。");
          } else if (typeof data.transcript === "string" && data.transcript.trim()) {
            setTranscript(data.transcript.trim().slice(-1200));
          } else if (data.type?.includes("transcript") && typeof data.delta === "string") {
            setTranscript(previous => (previous + data.delta).slice(-1200));
          }
        } catch { /* Ignore unrelated data-channel messages */ }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" || peer.connectionState === "closed") {
          stop("連線已中斷。");
        }
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      // Avoid sending an incomplete SDP before browser ICE gathering settles.
      if (peer.iceGatheringState !== "complete") {
        await new Promise<void>((resolve) => {
          const onChange = () => {
            if (peer.iceGatheringState === "complete") done();
          };
          const done = () => {
            clearTimeout(timer);
            peer.removeEventListener("icegatheringstatechange", onChange);
            resolve();
          };
          const timer = setTimeout(done, 5000);
          peer.addEventListener("icegatheringstatechange", onChange);
          if (peer.iceGatheringState === "complete") done();
        });
      }
      if (!peer.localDescription?.sdp) throw new Error("沒有產生 WebRTC SDP。");
      const response = await fetch("/api/live11-lab/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Nubo-Live11-Lab-Pin": pin.trim() },
        body: JSON.stringify({ action: "start", sdp: peer.localDescription.sdp }),
        cache: "no-store",
      });
      const payload = await response.json() as { sdp?: string; model?: string; error?: string };
      if (!response.ok || !payload.sdp) throw new Error(payload.error || `連線失敗：HTTP ${response.status}`);
      if (peerRef.current !== peer) return;
      setLastModel(payload.model || "");
      await peer.setRemoteDescription({ type: "answer", sdp: payload.sdp });
      const started = Date.now();
      intervalRef.current = setInterval(() => setSeconds(Math.min(MAX_SECONDS, Math.ceil((Date.now() - started) / 1000))), 1000);
      timeoutRef.current = setTimeout(() => stop("單次測試已達 2 分鐘，已自動中斷。"), MAX_SECONDS * 1000);
      setMessage("連線已建立，正在確認 Live 工作階段…");
    } catch (error) {
      cleanup();
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "語音測試無法啟動。");
    }
  }

  const changeScore = (index: number, key: keyof Score, value: string) => {
    setScores(old => old.map((entry, i) => i === index ? { ...entry, [key]: value } : entry));
  };
  const exportReport = () => {
    const lines = [
      "NUBO 台語 A/B 測試－GPT-Live-1.1", `台灣時間：${timestamp()}`,
      `實際連線模型：${lastModel || "尚未取得成功連線"}`, "評分：理解 1～5；口音 1～5",
      ...QUESTIONS.map((q, i) =>
        `${i + 1}. ${q.topic}｜${q.taigi}\n理解：${scores[i].recognition || "未填"}；口音：${scores[i].accent || "未填"}；備註：${scores[i].note || "未填"}`),
    ];
    void navigator.clipboard.writeText(lines.join("\n")).then(
      () => setMessage("測試結果已複製（不包含 API 金鑰）。"),
      () => setMessage("複製未成功，請使用瀏覽器分享或手動記錄。"),
    );
  };

  return (
    <main style={{ maxWidth: 660, margin: "0 auto", padding: 20, fontFamily: "system-ui, sans-serif", lineHeight: 1.65 }}>
      <h1>NUBO｜台灣台語語音試聽</h1>
      <p><strong>OpenAI GPT-Live-1.1 獨立測試</strong> — 不變更正式接待、不連 PMS、不發 LINE。</p>
      <p>語音 API 依時間計費。每次最多通話 2 分鐘，請一次只開一個頁面；離開頁面會關閉麥克風連線。</p>
      <label htmlFor="lab-pin">測試授權碼（不是 API Key）</label>
      <input id="lab-pin" type="password" value={pin} autoComplete="off" onChange={e => setPin(e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", padding: 10, marginTop: 4, marginBottom: 12 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={styleButton(status === "connecting" || status === "connected")}
          disabled={status === "connecting" || status === "connected"} onClick={() => void begin()}>啟動 2 分鐘試音</button>
        <button type="button" style={{ ...styleButton(), background: "#75443d" }}
          onClick={() => stop()}>結束通話</button>
      </div>
      <p role="status">狀態：{status}｜秒數：{seconds}／120｜{message}</p>
      {lastModel ? <p>模型：<strong>{lastModel}</strong></p> : null}
      {transcript ? <p style={{ background: "#eef2ef", padding: 12, borderRadius: 8 }}>字幕（僅供輔助）：{transcript}</p> : null}
      <h2>六句台語固定測試</h2>
      <p>每一句都用平常台灣人的語速說，聽回覆後評分。房況／價格題只測語言表達：本測試版不查即時庫存。</p>
      {QUESTIONS.map((q, i) => (
        <section key={q.topic} style={{ borderTop: "1px solid #d0d5d2", padding: "14px 0" }}>
          <strong>{i + 1}. {q.topic}</strong>
          <p style={{ margin: "4px 0" }}>{q.taigi}</p>
          <small>{q.zh}</small>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
            <label>聽懂程度
              <select aria-label={`第${i + 1}句理解評分`} value={scores[i].recognition}
                onChange={e => changeScore(i, "recognition", e.target.value)}>
                <option value="">未評分</option>{[1, 2, 3, 4, 5].map(v => <option key={v} value={String(v)}>{v} / 5</option>)}
              </select>
            </label>
            <label>台灣台語口音
              <select aria-label={`第${i + 1}句口音評分`} value={scores[i].accent}
                onChange={e => changeScore(i, "accent", e.target.value)}>
                <option value="">未評分</option>{[1, 2, 3, 4, 5].map(v => <option key={v} value={String(v)}>{v} / 5</option>)}
              </select>
            </label>
          </div>
          <textarea aria-label={`第${i + 1}句備註`} placeholder="發音不自然的字詞／有無答非所問"
            value={scores[i].note} rows={2} onChange={e => changeScore(i, "note", e.target.value)}
            style={{ width: "100%", marginTop: 8, boxSizing: "border-box", padding: 8 }} />
        </section>
      ))}
      <button type="button" style={styleButton()} onClick={exportReport}>複製測試評分</button>
      <p style={{ fontSize: 12, opacity: .8 }}>評分只保留在目前瀏覽器頁面，不上傳個資或評分。若連線失敗，請確認測試環境已啟用且具有 API 權限。</p>
    </main>
  );
}
