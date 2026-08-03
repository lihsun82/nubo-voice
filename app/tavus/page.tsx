"use client";

import Script from "next/script";
import { createElement, useEffect, useState } from "react";

const DEPLOYMENT_ID = "4601bb54-4f03-4cf1-a019-420df2e6856d";

export default function TavusPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(circle at top, rgba(93, 120, 255, 0.22), transparent 38%), #070914",
        color: "#ffffff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Script
        src="https://unpkg.com/@tavus/embed@beta"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />

      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "18px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(7, 9, 20, 0.78)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.04em" }}>
            NUBO 真人助理
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
            溫柔、專業的繁體中文智慧管家
          </div>
        </div>

        <a
          href="/"
          style={{
            color: "#ffffff",
            textDecoration: "none",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 999,
            padding: "10px 14px",
            fontSize: 14,
            background: "rgba(255,255,255,0.06)",
          }}
        >
          返回 NUBO
        </a>
      </header>

      <section
        style={{
          width: "100%",
          maxWidth: 1280,
          margin: "0 auto",
          padding: "16px",
          flex: 1,
          display: "flex",
        }}
      >
        <div
          style={{
            width: "100%",
            minHeight: "calc(100dvh - 112px)",
            borderRadius: 24,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.04)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
            position: "relative",
          }}
        >
          {!ready && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                color: "rgba(255,255,255,0.75)",
                zIndex: 1,
              }}
            >
              正在載入真人 NUBO…
            </div>
          )}

          <div style={{ width: "100%", height: "100%", minHeight: "calc(100dvh - 112px)" }}>
            {createElement("tavus-embed", {
              "deployment-id": DEPLOYMENT_ID,
              style: {
                display: "block",
                width: "100%",
                height: "100%",
                minHeight: "calc(100dvh - 112px)",
              },
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
