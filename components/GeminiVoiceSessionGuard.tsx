"use client";

import { useEffect, useRef, useState } from "react";
import { GeminiVoiceConsole } from "@/components/GeminiVoiceConsole";
import {
  acquireVoiceLock,
  announceVoiceOwnerChange,
  createVoiceOwnerId,
  listenForVoiceOwnerChanges,
  refreshVoiceLock,
  releaseVoiceLock,
} from "@/lib/browser-voice-lock";

export function GeminiVoiceSessionGuard() {
  const ownerIdRef = useRef(createVoiceOwnerId());
  const heartbeatRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("");

  const release = () => {
    if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    releaseVoiceLock(ownerIdRef.current);
    announceVoiceOwnerChange();
    setActive(false);
  };

  const acquire = () => {
    if (!acquireVoiceLock(ownerIdRef.current, "Gemini Live")) {
      setMessage("已經有另一個NUBO語音分頁正在執行。請先關閉其他NUBO分頁，或在那個分頁按結束對話。");
      return;
    }
    announceVoiceOwnerChange();
    if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    heartbeatRef.current = window.setInterval(() => {
      if (!refreshVoiceLock(ownerIdRef.current, "Gemini Live")) {
        setMessage("語音控制權已被另一個分頁取得，本分頁已停止。請只保留一個NUBO分頁。");
        release();
      }
    }, 2500);
    setMessage("");
    setActive(true);
  };

  useEffect(() => {
    const cleanup = listenForVoiceOwnerChanges(ownerIdRef.current, () => {
      if (active) {
        setMessage("偵測到另一個NUBO語音分頁，本分頁已釋放控制權，避免雙重聲音。");
        release();
      }
    });
    window.addEventListener("beforeunload", release);
    return () => {
      cleanup();
      window.removeEventListener("beforeunload", release);
      release();
    };
  }, [active]);

  if (!active) {
    return (
      <section className="console" aria-live="polite">
        <div className="status">
          <strong>NUBO語音待命</strong>
          <span>為避免雙重聲音，請先取得此分頁的語音控制權。</span>
        </div>
        <div className="actions">
          <button className="primary" onClick={acquire}>
            取得語音控制權
          </button>
        </div>
        {message ? <div className="error">{message}</div> : null}
      </section>
    );
  }

  return (
    <>
      <GeminiVoiceConsole />
      <section className="console" aria-live="polite">
        <div className="status">
          <strong>語音控制權已鎖定在此分頁</strong>
          <span>其他NUBO分頁會被阻擋，避免雙重語音。</span>
        </div>
        <div className="actions">
          <button className="secondary" onClick={release}>
            釋放語音控制權
          </button>
        </div>
      </section>
    </>
  );
}
