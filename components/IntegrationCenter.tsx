"use client";

import { useCallback, useEffect, useState } from "react";

type GmailStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  scopes: string[];
};

type ProviderStatus = {
  workChain: string[];
  researchChain: string[];
  voiceProvider: string;
  providers: Array<{ name: string; configured: boolean; model: string }>;
};

export function IntegrationCenter() {
  const [gmail, setGmail] = useState<GmailStatus | null>(null);
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [message, setMessage] = useState("正在讀取整合狀態");

  const load = useCallback(async () => {
    const [gmailResponse, providerResponse] = await Promise.all([
      fetch("/api/gmail/status", { cache: "no-store" }),
      fetch("/api/providers", { cache: "no-store" }),
    ]);
    const gmailData = await gmailResponse.json();
    const providerData = await providerResponse.json();
    setGmail(gmailData);
    setProviders(providerData);
    setMessage("整合狀態已更新");
  }, []);

  useEffect(() => {
    void load();
    const listener = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "nubo-gmail-oauth") void load();
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [load]);

  const connectGmail = () => {
    const popup = window.open(
      "/api/google/oauth/start",
      "nubo-gmail-oauth",
      "width=620,height=760,noopener=no",
    );
    if (!popup) setMessage("瀏覽器阻擋了OAuth視窗，請允許彈出式視窗後再試一次");
  };

  const testYouTube = async () => {
    const response = await fetch("/api/youtube/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "relaxing hotel lobby music", service: "youtube_music" }),
    });
    const result = await response.json();
    setMessage(response.ok ? result.message : result.error ?? "YouTube測試失敗");
  };

  return (
    <section className="integration-center">
      <div className="integration-heading">
        <div>
          <div className="eyebrow">NUBO ACTIONS</div>
          <h2>工具與帳號整合</h2>
          <p>{message}</p>
        </div>
        <button className="secondary" onClick={() => void load()}>
          重新整理
        </button>
      </div>

      <div className="integration-grid">
        <article className="integration-card">
          <div className="integration-card-top">
            <strong>Gmail</strong>
            <span className={`badge ${gmail?.connected ? "active" : "paused"}`}>
              {gmail?.connected ? "已連接" : gmail?.configured ? "待授權" : "未設定"}
            </span>
          </div>
          <p>
            {gmail?.connected
              ? `帳號：${gmail.email ?? "Google帳號"}`
              : "搜尋、讀信、摘要、草稿與兩階段確認寄送。"}
          </p>
          <button className="secondary" onClick={connectGmail} disabled={!gmail?.configured}>
            {gmail?.connected ? "重新授權Gmail" : "連接Gmail"}
          </button>
          {!gmail?.configured ? (
            <small>請先在.env.local設定GOOGLE_CLIENT_ID與GOOGLE_CLIENT_SECRET。</small>
          ) : null}
        </article>

        <article className="integration-card">
          <div className="integration-card-top">
            <strong>YouTube／YouTube Music</strong>
            <span className="badge active">Windows可用</span>
          </div>
          <p>語音說出歌曲、歌手或影片主題後，NUBO會直接開啟對應搜尋。</p>
          <button className="secondary" onClick={() => void testYouTube()}>
            測試開啟YouTube Music
          </button>
        </article>

        <article className="integration-card">
          <div className="integration-card-top">
            <strong>AI研究引擎</strong>
            <span className="badge active">自動備援</span>
          </div>
          <p>{providers ? providers.researchChain.join(" → ") : "載入中"}</p>
          <small>研究結果會附來源並存入NUBO收件匣。</small>
        </article>

        <article className="integration-card">
          <div className="integration-card-top">
            <strong>自動寄送安全</strong>
            <span className="badge paused">預設草稿</span>
          </div>
          <p>即時寄信必須先預覽再確認；排程寄送只有白名單收件者可自動寄出。</p>
          <small>設定NUBO_EMAIL_AUTOSEND=true及NUBO_EMAIL_ALLOWLIST後才會開放。</small>
        </article>
      </div>
    </section>
  );
}
