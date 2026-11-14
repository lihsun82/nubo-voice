"use client";

import { useEffect, useRef, useState } from "react";
import {
  NUBO_DEFAULT_VOICE_PROFILE,
  NUBO_GEMINI_VOICES,
  NUBO_OPENAI_VOICES,
  NUBO_PERSONALITY_OPTIONS,
  readNuboVoiceProfile,
  type NuboVoiceEngine,
  type NuboVoiceProfile,
} from "@/lib/nubo-voice-profile";
import {
  NUBO_DEFAULT_VOICE_TUNING,
  readNuboVoiceTuning,
  type NuboVoiceTuning,
} from "@/lib/nubo-voice-tuning";
import type { NuboGuestRuntimeConfig } from "@/lib/nubo-guest-features";

type AdminConfig = NuboGuestRuntimeConfig & { updatedAt: string };
type AdminSession = { authenticated: boolean; email: string | null; clientId: string | null; configured: boolean };
type LineStatus = {
  state: "ready" | "delivered" | "quota_exhausted" | "failed";
  at: string | null;
  retryAfterSeconds: number;
  deliveryMode: string;
};
type GoogleIdentity = {
  accounts: { id: {
    initialize: (value: { client_id: string; callback: (response: { credential: string }) => void }) => void;
    renderButton: (element: HTMLElement, options: Record<string, string>) => void;
  } };
};

const TUNING: Array<{ key: keyof NuboVoiceTuning; label: string; min: number; max: number; step: number }> = [
  { key: "speed", label: "語速", min: 0.85, max: 1.15, step: 0.01 },
  { key: "perceivedPitch", label: "感知音高", min: -30, max: 30, step: 1 },
  { key: "brightness", label: "明亮度", min: -8, max: 8, step: 0.5 },
  { key: "warmth", label: "溫暖度", min: -8, max: 8, step: 0.5 },
  { key: "presence", label: "清晰度", min: -8, max: 8, step: 0.5 },
  { key: "compression", label: "動態壓縮", min: 0, max: 100, step: 1 },
  { key: "outputGain", label: "輸出音量", min: 0.7, max: 1.3, step: 0.01 },
  { key: "cadence", label: "頓挫感", min: 0, max: 100, step: 1 },
  { key: "emotion", label: "情感", min: 0, max: 100, step: 1 },
  { key: "fillers", label: "語助詞", min: 0, max: 100, step: 1 },
  { key: "relaxed", label: "放鬆感", min: 0, max: 100, step: 1 },
];

const card: React.CSSProperties = {
  background: "#152039", border: "1px solid #32496e", borderRadius: 18,
  padding: 22, display: "grid", gap: 16,
};
const input: React.CSSProperties = {
  width: "100%", padding: 12, borderRadius: 10, border: "1px solid #5b7194",
  background: "#0b1427", color: "#fff", fontSize: 16,
};
const button: React.CSSProperties = {
  padding: "11px 18px", borderRadius: 10, border: "1px solid #85a7d2",
  background: "#31578c", color: "#fff", cursor: "pointer", fontSize: 15,
};

export default function AdminPage() {
  const googleButton = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [lineStatus, setLineStatus] = useState<LineStatus | null>(null);
  const [profile, setProfile] = useState<NuboVoiceProfile>(NUBO_DEFAULT_VOICE_PROFILE);
  const [tuning, setTuning] = useState<NuboVoiceTuning>(NUBO_DEFAULT_VOICE_TUNING);
  const [idle, setIdle] = useState(30);
  const [wakeWords, setWakeWords] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadConfig = async () => {
    const response = await fetch("/api/admin/config", { cache: "no-store" });
    if (!response.ok) throw new Error("無法讀取後台設定");
    const value = await response.json() as AdminConfig;
    setConfig(value);
    setIdle(value.idleSeconds);
    setWakeWords(value.wakeWords.join("、"));
    setProfile(value.voiceProfile as NuboVoiceProfile | null || readNuboVoiceProfile());
    setTuning(value.voiceTuning as NuboVoiceTuning | null || readNuboVoiceTuning());
  };

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/session", { cache: "no-store" })
      .then((response) => response.json())
      .then(async (value: AdminSession) => {
        if (!active) return;
        setSession(value);
        if (value.authenticated) await loadConfig();
      })
      .catch(() => { if (active) setMessage("無法連接後台，請重新整理。"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session?.clientId || session.authenticated || !googleButton.current) return;
    let active = true;
    const render = () => {
      const google = (window as typeof window & { google?: GoogleIdentity }).google;
      if (!active || !google || !googleButton.current) return;
      googleButton.current.replaceChildren();
      google.accounts.id.initialize({
        client_id: session.clientId!,
        callback: ({ credential }) => {
          setBusy(true);
          setMessage("");
          void fetch("/api/admin/session", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-nubo-admin-action": "1" },
            body: JSON.stringify({ credential }),
          }).then(async (response) => {
            const value = await response.json();
            if (!response.ok) throw new Error(value.error || "登入失敗");
            setSession({ ...session, authenticated: true, email: value.email });
            await loadConfig();
          }).catch((error) => setMessage(error instanceof Error ? error.message : "登入失敗"))
            .finally(() => setBusy(false));
        },
      });
      google.accounts.id.renderButton(googleButton.current, {
        type: "standard", theme: "outline", size: "large", text: "signin_with",
      });
    };
    if ((window as typeof window & { google?: GoogleIdentity }).google) render();
    else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = render;
      script.onerror = () => setMessage("Google 登入載入失敗，請使用 Chrome 開啟後台。");
      document.head.appendChild(script);
    }
    return () => { active = false; };
  }, [session?.clientId, session?.authenticated]);

  useEffect(() => {
    if (!session?.authenticated) return;
    let active = true;
    const refresh = async () => {
      const response = await fetch("/api/notify/arrival-intent", { cache: "no-store" });
      if (response.ok && active) setLineStatus(await response.json() as LineStatus);
    };
    void refresh().catch(() => undefined);
    const timer = window.setInterval(() => void refresh().catch(() => undefined), 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [session?.authenticated]);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-nubo-admin-action": "1" },
        body: JSON.stringify(patch),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "儲存失敗");
      setConfig(value as AdminConfig);
      setMessage("已儲存。已配對的旅客平板會在數秒內同步。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  };

  const pair = async (thisDevice: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/pairing", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-nubo-admin-action": "1" },
        body: JSON.stringify({ thisDevice }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "配對失敗");
      if (thisDevice) setMessage("這台裝置已配對，可以接收後台設定。");
      else setPairCode(value.code);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "配對失敗");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/session", {
      method: "DELETE", headers: { "x-nubo-admin-action": "1" },
    });
    setSession((value) => value ? { ...value, authenticated: false, email: null } : value);
    setConfig(null);
    setLineStatus(null);
  };

  const voices = profile.engine === "gemini" ? NUBO_GEMINI_VOICES : NUBO_OPENAI_VOICES;

  return (
    <main style={{ minHeight: "100vh", background: "#091222", color: "#edf5ff", padding: "32px 16px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: "min(880px, 100%)", margin: "auto", display: "grid", gap: 20 }}>
        <header>
          <h1 style={{ marginBottom: 8 }}>AINUBO 管理後台</h1>
          <p style={{ color: "#b7c9e3" }}>設定只會同步到已配對的旅客平板。旅客首頁仍維持單一語音畫面。</p>
        </header>
        {message ? <p role="status" style={{ padding: 12, background: "#263a5a", borderRadius: 10 }}>{message}</p> : null}
        {!session ? <p>正在檢查登入狀態…</p> : !session.configured ? (
          <section style={card}>Google 後台登入尚未設定完成。</section>
        ) : !session.authenticated ? (
          <section style={card}>
            <h2>管理員登入</h2>
            <p>請使用指定的 Google 帳號登入。</p>
            <div ref={googleButton} />
          </section>
        ) : config ? (
          <>
            <section style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span>已登入：{session.email}</span>
                <button type="button" style={button} onClick={() => void logout()}>登出</button>
              </div>
            </section>
            <section style={card}>
              <h2>LINE 群組通知</h2>
              <p>{lineStatus?.state === "quota_exhausted"
                ? "LINE 已達本月訊息額度；目前入住、訂房通知無法送達。請到 LINE 官方帳號後台提高方案或加購額度。"
                : lineStatus?.state === "delivered"
                  ? "最近一次通知已送達 LINE。"
                  : lineStatus?.state === "failed"
                    ? "最近一次 LINE 通知失敗，請檢查 LINE 帳號與 Relay。"
                    : "尚無近期通知結果。"}</p>
              {lineStatus?.at ? <small>最後結果：{new Date(lineStatus.at).toLocaleString("zh-TW")}</small> : null}
              {lineStatus?.state === "quota_exhausted" && lineStatus.retryAfterSeconds > 0
                ? <small>為避免重複發送，暫停嘗試 {lineStatus.retryAfterSeconds} 秒。</small> : null}
            </section>
            <section style={card}>
              <h2>配對旅客平板</h2>
              <p>在目前平板登入後台，可直接配對；其他平板可用一次性配對碼，在該平板開啟 /pair 輸入。配對碼 10 分鐘有效。</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" style={button} disabled={busy} onClick={() => void pair(true)}>配對這台裝置</button>
                <button type="button" style={button} disabled={busy} onClick={() => void pair(false)}>產生其他平板配對碼</button>
              </div>
              {pairCode ? <strong style={{ fontSize: 24, letterSpacing: 3 }}>配對碼：{pairCode}</strong> : null}
            </section>
            <section style={card}>
              <h2>旅客音樂播放</h2>
              <label><input type="checkbox" checked={config.musicEnabled} disabled={busy}
                onChange={(event) => void save({ musicEnabled: event.target.checked })} /> 允許旅客使用音樂／YouTube 播放</label>
              <small>目前關閉時，旅客頁不顯示播放器，語音也不觸發播放。</small>
            </section>
            <section style={card}>
              <h2>待機與喚醒詞</h2>
              <label>無對話後待機秒數
                <input style={input} type="number" min={10} max={300} value={idle}
                  onChange={(event) => setIdle(Number(event.target.value))} />
              </label>
              <label>喚醒詞（用頓號或逗號分隔）
                <textarea style={input} rows={2} value={wakeWords}
                  onChange={(event) => setWakeWords(event.target.value)} />
              </label>
              <button type="button" style={button} disabled={busy} onClick={() => void save({
                idleSeconds: idle,
                wakeWords: wakeWords.split(/[、,，\n]+/).map((word) => word.trim()).filter(Boolean),
              })}>儲存待機與喚醒詞</button>
            </section>
            <section style={card}>
              <h2>語音設定</h2>
              <p>{config.voiceProfile ? "後台已指定聲線" : "目前沿用各平板原有聲線，尚未覆蓋已儲存數據。"}</p>
              <label>語音核心
                <select style={input} value={profile.engine} onChange={(event) => {
                  const engine = event.target.value as NuboVoiceEngine;
                  setProfile({ ...profile, engine, voice: engine === "gemini" ? "Leda" : "shimmer" });
                }}>
                  <option value="gemini">Gemini Live</option>
                  <option value="openai">OpenAI Realtime</option>
                </select>
              </label>
              <label>聲線
                <select style={input} value={profile.voice} onChange={(event) => setProfile({ ...profile, voice: event.target.value as NuboVoiceProfile["voice"] })}>
                  {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
                </select>
              </label>
              <label>對話風格
                <select style={input} value={profile.personality} onChange={(event) => setProfile({ ...profile, personality: event.target.value as NuboVoiceProfile["personality"] })}>
                  {NUBO_PERSONALITY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" style={button} disabled={busy} onClick={() => void save({ voiceProfile: profile })}>儲存聲線</button>
                <button type="button" style={button} disabled={busy} onClick={() => void save({ voiceProfile: null })}>改回平板原有聲線</button>
              </div>
            </section>
            <section style={card}>
              <h2>聲線微調</h2>
              <p>{config.voiceTuning ? "後台已指定調音數據" : "目前沿用各平板已儲存的調音數據。若在原平板登入後台，以下會帶入該平板的數據。"}</p>
              {TUNING.map((control) => (
                <label key={control.key} style={{ display: "grid", gap: 6 }}>
                  <span>{control.label}：{tuning[control.key]}</span>
                  <input type="range" min={control.min} max={control.max} step={control.step}
                    value={tuning[control.key]} onChange={(event) => setTuning({
                      ...tuning, [control.key]: Number(event.target.value),
                    })} />
                </label>
              ))}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" style={button} disabled={busy} onClick={() => void save({ voiceTuning: tuning })}>儲存調音</button>
                <button type="button" style={button} disabled={busy} onClick={() => void save({ voiceTuning: null })}>改回平板原有調音</button>
              </div>
            </section>
          </>
        ) : <p>正在載入設定…</p>}
      </div>
    </main>
  );
}
