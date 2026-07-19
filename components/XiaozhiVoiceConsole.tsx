"use client";

import { useEffect, useMemo, useState } from "react";

const XIAOZHI_H5_STORAGE_KEY = "nubo_xiaozhi_h5_url_v1";

type XiaozhiConfig = {
  configured?: boolean;
  h5Url?: string | null;
  websocketConfigured?: boolean;
  publicThirdPartyBackendEnabled?: boolean;
};

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

function normalizeH5Url(value: string) {
  const raw = value.trim();
  if (!raw) return "";

  const url = new URL(raw);
  const allowed =
    url.protocol === "https:" ||
    (url.protocol === "http:" && isLocalHostname(url.hostname));

  if (!allowed) {
    throw new Error("正式環境必須使用 HTTPS；本機測試才允許 localhost HTTP。");
  }

  return url.toString();
}

export function XiaozhiVoiceConsole() {
  const [serverConfig, setServerConfig] = useState<XiaozhiConfig>({});
  const [urlInput, setUrlInput] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [embedded, setEmbedded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const localUrl = window.localStorage.getItem(XIAOZHI_H5_STORAGE_KEY) ?? "";
        const response = await fetch("/api/xiaozhi/config", {
          cache: "no-store",
        });
        const payload = (await response.json()) as XiaozhiConfig;
        const configuredUrl = localUrl.trim() || payload.h5Url || "";

        if (cancelled) return;
        setServerConfig(payload);
        setSavedUrl(configuredUrl);
        setUrlInput(configuredUrl);
      } catch (cause) {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "讀取小智語音設定失敗。",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = Boolean(savedUrl);
  const displayHost = useMemo(() => {
    if (!savedUrl) return "尚未設定自架服務";
    try {
      return new URL(savedUrl).host;
    } catch {
      return savedUrl;
    }
  }, [savedUrl]);

  const saveEndpoint = () => {
    setError("");

    try {
      const normalized = normalizeH5Url(urlInput);
      if (!normalized) {
        window.localStorage.removeItem(XIAOZHI_H5_STORAGE_KEY);
        setSavedUrl("");
        setEmbedded(false);
        return;
      }

      window.localStorage.setItem(XIAOZHI_H5_STORAGE_KEY, normalized);
      setSavedUrl(normalized);
      setUrlInput(normalized);
      setEmbedded(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "小智服務網址格式不正確。",
      );
    }
  };

  const startEmbedded = () => {
    if (!savedUrl) return;
    setError("");
    setEmbedded(true);
  };

  const openStandalone = () => {
    if (!savedUrl) return;
    const opened = window.open(savedUrl, "nubo_xiaozhi_voice");
    if (!opened) {
      window.location.assign(savedUrl);
    }
  };

  return (
    <section className="console xiaozhi-console" aria-live="polite">
      <div className="xiaozhi-heading">
        <div>
          <span className="provider-label">XIAOZHI SELF-HOSTED</span>
          <h2>小智 Opus 串流語音</h2>
          <p>
            使用自架的小智 H5 客戶端與 WebSocket 後端。NUBO 不會自動連到公開的第三方中國伺服器。
          </p>
        </div>
        <span className={`xiaozhi-status ${ready ? "ready" : "needs-config"}`}>
          {loading ? "讀取中" : ready ? "可啟動" : "待設定"}
        </span>
      </div>

      <div className="xiaozhi-endpoint-card">
        <label htmlFor="xiaozhi-h5-url">自架小智 H5 網址</label>
        <div className="xiaozhi-endpoint-row">
          <input
            id="xiaozhi-h5-url"
            data-nubo-touch-lock="true"
            type="url"
            inputMode="url"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            placeholder="https://你的網域/h5/index.html"
            autoComplete="off"
            spellCheck={false}
          />
          <button className="secondary" type="button" onClick={saveEndpoint}>
            儲存網址
          </button>
        </div>
        <small>
          目前來源：{displayHost}
          {serverConfig.websocketConfigured ? "；WebSocket 已在伺服器端設定" : ""}
        </small>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="actions">
        <button
          className="primary"
          type="button"
          onClick={startEmbedded}
          disabled={!ready}
        >
          在 NUBO 內啟動
        </button>
        <button
          className="secondary"
          type="button"
          onClick={openStandalone}
          disabled={!ready}
        >
          獨立開啟
        </button>
        {embedded ? (
          <button
            className="secondary"
            type="button"
            onClick={() => setEmbedded(false)}
          >
            關閉小智語音
          </button>
        ) : null}
      </div>

      {embedded && savedUrl ? (
        <div className="xiaozhi-frame-wrap">
          <iframe
            className="xiaozhi-frame"
            src={savedUrl}
            title="NUBO 小智 Opus 語音"
            allow="microphone; autoplay; clipboard-read; clipboard-write"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <div className="voice-transcript">
          {ready
            ? "按「在 NUBO 內啟動」後，允許小智頁面使用麥克風。若後端禁止被內嵌，請改用「獨立開啟」。"
            : "第二語音核心已加入，但尚未設定自架的小智 H5 網址。Gemini Live 仍維持原本可用狀態。"}
        </div>
      )}

      <div className="capabilities">
        <div className="capability">
          <b>Opus 串流</b>
          <small>由小智客戶端以 Opus 音訊幀連接自架 WebSocket。</small>
        </div>
        <div className="capability">
          <b>資料隔離</b>
          <small>只接受你設定的 HTTPS 自架端點，不內建公開測試服務。</small>
        </div>
        <div className="capability">
          <b>可逆切換</b>
          <small>隨時切回 Gemini Live，不修改既有 LINE 穩定控制。</small>
        </div>
      </div>
    </section>
  );
}
