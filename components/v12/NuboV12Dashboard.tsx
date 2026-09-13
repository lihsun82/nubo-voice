"use client";

import { useEffect, useMemo, useState } from "react";
import { nuboAgents, nuboAutomations } from "@/lib/v12/nubo-v12-data";
import "./nubo-v12.css";

type V12Log = {
  id: string;
  time: string;
  source: string;
  action: string;
  status: "success" | "warning" | "error" | "pending";
  detail: string;
};

type V12Notification = {
  id: string;
  time: string;
  level: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
};

type Briefing = {
  title: string;
  summary: string;
  metrics?: {
    logs: number;
    notifications: number;
    warnings: number;
    errors: number;
    smartHomeEvents: number;
  };
  priorities?: string[];
};

type VoiceState = "idle" | "listening" | "thinking" | "executing" | "speaking" | "error";

const navItems = [
  "Dashboard",
  "Briefing",
  "Voice Core",
  "Agents",
  "Tasks",
  "Automations",
  "Smart Home",
  "Research",
  "Email",
  "Calendar",
  "Hotel Ops",
  "Dev Log",
  "Settings",
];

function statusLabel(status: string) {
  if (status === "active") return "運作中";
  if (status === "warning") return "需注意";
  if (status === "error") return "錯誤";
  if (status === "success") return "成功";
  if (status === "pending") return "待確認";
  if (status === "paused") return "暫停";
  if (status === "draft") return "草稿";
  if (status === "info") return "資訊";
  return "待命";
}

function voiceStateLabel(state: VoiceState) {
  if (state === "idle") return "待命";
  if (state === "listening") return "聆聽中";
  if (state === "thinking") return "思考中";
  if (state === "executing") return "執行中";
  if (state === "speaking") return "回覆中";
  if (state === "error") return "錯誤";
  return "待命";
}

export default function NuboV12Dashboard() {
  const [logs, setLogs] = useState<V12Log[]>([]);
  const [notifications, setNotifications] = useState<V12Notification[]>([]);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loadingAction, setLoadingAction] = useState<"on" | "off" | null>(null);
  const [lastMessage, setLastMessage] = useState("V12 已就緒");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceText, setVoiceText] = useState("打開投射燈");
  const [voiceResult, setVoiceResult] = useState("等待語音指令");

  async function loadV12Data() {
    try {
      const [logsRes, notificationsRes, briefingRes] = await Promise.all([
        fetch("/api/v12/logs", { cache: "no-store" }),
        fetch("/api/v12/notifications", { cache: "no-store" }),
        fetch("/api/v12/briefing", { cache: "no-store" }),
      ]);

      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(Array.isArray(data.logs) ? data.logs : []);
      }

      if (notificationsRes.ok) {
        const data = await notificationsRes.json();
        setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      }

      if (briefingRes.ok) {
        const data = await briefingRes.json();
        setBriefing(data);
      }
    } catch {
      setLastMessage("V12 資料讀取失敗，請檢查 API");
    }
  }

  useEffect(() => {
    loadV12Data();
    const timer = window.setInterval(loadV12Data, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const conflictWarning = useMemo(() => {
    const recent = logs.slice(0, 6);
    const hasOn = recent.some((x) => x.action.includes("開啟"));
    const hasOff = recent.some((x) => x.action.includes("關閉"));

    if (hasOn && hasOff) {
      return "最近紀錄同時出現開啟與關閉，請檢查 Tapo / IFTTT / Google Home 是否有衝突自動化。";
    }

    return "";
  }, [logs]);

  async function callSmartHome(action: "on" | "off") {
    setLoadingAction(action);
    setVoiceState("executing");
    setLastMessage(action === "on" ? "正在送出開燈指令..." : "正在送出關燈指令...");

    try {
      const res = await fetch("/api/smart-home/light", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setVoiceState("error");
        setLastMessage("智慧家庭指令失敗：" + (data.message || data.error || res.status));
        await loadV12Data();
        return;
      }

      setVoiceState("speaking");
      setLastMessage(data.message || (action === "on" ? "已送出開燈指令" : "已送出關燈指令"));
      await loadV12Data();

      window.setTimeout(() => setVoiceState("idle"), 1200);
    } catch {
      setVoiceState("error");
      setLastMessage("智慧家庭 API 無法連線");
    } finally {
      setLoadingAction(null);
    }
  }

  async function simulateVoice(command?: string) {
    const text = command || voiceText;
    setVoiceText(text);
    setVoiceState("listening");
    setVoiceResult(`收到：「${text}」`);
    setLastMessage("正在理解語音指令...");

    window.setTimeout(() => setVoiceState("thinking"), 350);

    try {
      const res = await fetch("/api/v12/voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });

      setVoiceState("executing");
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setVoiceState("error");
        setVoiceResult(data.message || "語音核心執行失敗");
        setLastMessage("語音核心執行失敗");
        await loadV12Data();
        return;
      }

      setVoiceState("speaking");
      setVoiceResult(data.message || "指令已接收");
      setLastMessage(data.message || "指令已接收");
      await loadV12Data();

      window.setTimeout(() => setVoiceState("idle"), 1500);
    } catch {
      setVoiceState("error");
      setVoiceResult("語音核心 API 無法連線");
      setLastMessage("語音核心 API 無法連線");
    }
  }

  return (
    <main className="nubo-v12-shell">
      <aside className="nubo-sidebar">
        <div className="nubo-brand">
          <div className="nubo-brand-mark">N</div>
          <div>
            <div className="nubo-brand-title">NUBO</div>
            <div className="nubo-brand-subtitle">Automation OS V12</div>
          </div>
        </div>

        <nav className="nubo-nav">
          {navItems.map((item, index) => (
            <button key={item} className={index === 0 ? "active" : ""}>
              <span>{item}</span>
            </button>
          ))}
        </nav>

        <div className="nubo-sidebar-footer">
          <div className="nubo-small-label">System</div>
          <div className="nubo-system-pill">Online · 127.0.0.1</div>
        </div>
      </aside>

      <section className="nubo-main">
        <header className="nubo-topbar">
          <div>
            <div className="nubo-eyebrow">AI Automation Command Center</div>
            <h1>NUBO V12 中控台</h1>
          </div>
          <div className={`nubo-topbar-status voice-${voiceState}`}>
            <span className="nubo-dot"></span>
            {voiceStateLabel(voiceState)}
          </div>
        </header>

        <section className="nubo-hero-grid">
          <div className={`nubo-core-card voice-${voiceState}`}>
            <div className="nubo-core-wrap">
              <div className="nubo-orbit orbit-one"></div>
              <div className="nubo-orbit orbit-two"></div>
              <div className={`nubo-core voice-${voiceState}`}>
                <div className="nubo-core-inner">
                  <span>NUBO</span>
                  <small>{voiceStateLabel(voiceState)}</small>
                </div>
              </div>

              {nuboAgents.slice(1, 7).map((agent, index) => (
                <div key={agent.id} className={`nubo-agent-node node-${index + 1} ${agent.status}`}>
                  <strong>{agent.name}</strong>
                  <span>{agent.role}</span>
                </div>
              ))}
            </div>

            <div className="nubo-core-caption">
              <h2>中央 AI 主腦</h2>
              <p>負責語音理解、任務分派、自動化流程與結果回報。</p>
              <p className="nubo-live-message">{lastMessage}</p>
            </div>
          </div>

          <div className="nubo-panel nubo-briefing">
            <div className="nubo-panel-head">
              <h2>{briefing?.title || "今日簡報"}</h2>
              <span>Live Briefing</span>
            </div>
            <p className="nubo-briefing-main">
              {briefing?.summary || "正在讀取 V12 今日簡報..."}
            </p>
            <div className="nubo-mini-grid">
              <div>
                <strong>{briefing?.metrics?.logs ?? logs.length}</strong>
                <span>Logs</span>
              </div>
              <div>
                <strong>{briefing?.metrics?.warnings ?? 0}</strong>
                <span>Warnings</span>
              </div>
              <div>
                <strong>{briefing?.metrics?.errors ?? 0}</strong>
                <span>Errors</span>
              </div>
            </div>
          </div>

          <div className="nubo-panel nubo-smart-home">
            <div className="nubo-panel-head">
              <h2>智慧家庭</h2>
              <span>Smart Home</span>
            </div>
            <div className={`nubo-device-card ${conflictWarning ? "warning" : ""}`}>
              <div>
                <strong>投射燈</strong>
                <p>
                  {conflictWarning ||
                    "IFTTT Webhook 已接通。V12 目前會記錄指令，但尚未回讀實體狀態。"}
                </p>
              </div>
              <span>{conflictWarning ? "衝突警示" : "Webhook OK"}</span>
            </div>
            <div className="nubo-action-row">
              <button disabled={loadingAction !== null} onClick={() => callSmartHome("on")}>
                {loadingAction === "on" ? "送出中..." : "開燈"}
              </button>
              <button disabled={loadingAction !== null} onClick={() => callSmartHome("off")}>
                {loadingAction === "off" ? "送出中..." : "關燈"}
              </button>
            </div>
          </div>
        </section>

        <section className="nubo-content-grid">
          <div className="nubo-panel">
            <div className="nubo-panel-head">
              <h2>Voice Core</h2>
              <span>語音核心</span>
            </div>

            <div className="nubo-voice-box">
              <label>模擬語音指令</label>
              <input
                value={voiceText}
                onChange={(event) => setVoiceText(event.target.value)}
                placeholder="例如：打開投射燈"
              />
              <div className="nubo-action-row">
                <button onClick={() => simulateVoice()}>執行語音指令</button>
                <button onClick={() => simulateVoice("關掉投射燈")}>快速測關燈</button>
              </div>
              <p className="nubo-live-message">{voiceResult}</p>

              <div className="nubo-quick-voice">
                <button onClick={() => simulateVoice("打開投射燈")}>打開投射燈</button>
                <button onClick={() => simulateVoice("關掉投射燈")}>關掉投射燈</button>
                <button onClick={() => simulateVoice("今日簡報")}>今日簡報</button>
                <button onClick={() => simulateVoice("查看任務")}>查看任務</button>
              </div>
            </div>
          </div>

          <div className="nubo-panel">
            <div className="nubo-panel-head">
              <h2>Agents</h2>
              <span>多代理人系統</span>
            </div>
            <div className="nubo-agent-list">
              {nuboAgents.map((agent) => (
                <div key={agent.id} className={`nubo-agent-card ${agent.status}`}>
                  <div>
                    <strong>{agent.name}</strong>
                    <span>{agent.role}</span>
                  </div>
                  <p>{agent.description}</p>
                  <em>{statusLabel(agent.status)}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="nubo-panel">
            <div className="nubo-panel-head">
              <h2>Automation Flows</h2>
              <span>工作流程</span>
            </div>
            <div className="nubo-flow-list">
              {nuboAutomations.map((automation) => (
                <div key={automation.id} className="nubo-flow-card">
                  <div className="nubo-flow-title">
                    <strong>{automation.name}</strong>
                    <span className={automation.status}>{statusLabel(automation.status)}</span>
                  </div>
                  <div className="nubo-flow-steps">
                    {automation.flow.map((step) => (
                      <span key={step}>{step}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="nubo-panel">
            <div className="nubo-panel-head">
              <h2>Activity Log</h2>
              <span>真實紀錄</span>
            </div>
            <div className="nubo-activity-list">
              {logs.length === 0 ? (
                <div className="nubo-empty-state">尚無活動紀錄。請先測試智慧家庭或新增 Log。</div>
              ) : (
                logs.slice(0, 8).map((activity) => (
                  <div key={activity.id} className={`nubo-activity-item ${activity.status}`}>
                    <div className="nubo-activity-time">{activity.time}</div>
                    <div>
                      <strong>{activity.source} · {activity.action}</strong>
                      <p>{activity.detail}</p>
                    </div>
                    <span>{statusLabel(activity.status)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="nubo-panel">
            <div className="nubo-panel-head">
              <h2>Notifications</h2>
              <span>通知中心</span>
            </div>
            <div className="nubo-activity-list">
              {notifications.length === 0 ? (
                <div className="nubo-empty-state">尚無通知。</div>
              ) : (
                notifications.slice(0, 8).map((notification) => (
                  <div key={notification.id} className={`nubo-activity-item ${notification.level}`}>
                    <div className="nubo-activity-time">{notification.time}</div>
                    <div>
                      <strong>{notification.title}</strong>
                      <p>{notification.message}</p>
                    </div>
                    <span>{statusLabel(notification.level)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
