"use client";

import { useState } from "react";
import NuboV12Shell from "@/components/v12/NuboV12Shell";

export default function SmartHomePage() {
  const [message, setMessage] = useState("等待指令");

  async function callLight(action: "on" | "off") {
    setMessage(action === "on" ? "正在送出開燈指令..." : "正在送出關燈指令...");

    const res = await fetch("/api/smart-home/light", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMessage(data.message || data.error || "智慧家庭指令失敗");
      return;
    }

    setMessage(data.message || "已送出指令");
  }

  return (
    <NuboV12Shell title="Smart Home 智慧家庭">
      <section className="nubo-page-grid">
        <div className="nubo-panel">
          <div className="nubo-panel-head">
            <h2>投射燈</h2>
            <span>IFTTT / Tapo</span>
          </div>

          <div className="nubo-device-card warning">
            <div>
              <strong>投射燈插座</strong>
              <p>目前透過 IFTTT Webhook 控制；尚未具備實體狀態回讀。</p>
            </div>
            <span>Webhook Mode</span>
          </div>

          <div className="nubo-action-row">
            <button onClick={() => callLight("on")}>開燈</button>
            <button onClick={() => callLight("off")}>關燈</button>
          </div>

          <p className="nubo-live-message">{message}</p>
        </div>

        <div className="nubo-panel">
          <div className="nubo-panel-head">
            <h2>狀態驗證</h2>
            <span>下一版</span>
          </div>
          <p>IFTTT 只能確認事件 fired，無法保證設備真的開啟。正式版建議接 Home Assistant 讀取狀態。</p>
        </div>
      </section>
    </NuboV12Shell>
  );
}
