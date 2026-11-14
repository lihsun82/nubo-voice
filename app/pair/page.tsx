"use client";

import { useState } from "react";

export default function PairPage() {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/guest/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-nubo-admin-action": "1" },
        body: JSON.stringify({ code }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "配對失敗");
      window.location.assign("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "配對失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", padding: 24, background: "#091222", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: 440, margin: "10vh auto", display: "grid", gap: 16 }}>
        <h1>配對 AINUBO 旅客平板</h1>
        <p>請輸入管理後台產生的 10 位數配對碼。</p>
        <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10}
          value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          style={{ padding: 14, borderRadius: 10, fontSize: 22, letterSpacing: 3 }} />
        <button type="button" disabled={busy || code.length !== 10} onClick={() => void submit()}
          style={{ padding: 14, borderRadius: 10, fontSize: 18 }}>完成配對</button>
        {message ? <p role="alert">{message}</p> : null}
      </div>
    </main>
  );
}
