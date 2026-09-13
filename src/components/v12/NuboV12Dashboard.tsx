"use client";

import { nuboActivities, nuboAgents, nuboAutomations } from "@/lib/v12/nubo-v12-data";
import "./nubo-v12.css";

const navItems = [
  "Dashboard",
  "Briefing",
  "Agents",
  "Tasks",
  "Automations",
  "Smart Home",
  "Research",
  "Email",
  "Calendar",
  "Hotel Ops",
  "Dev Log",
  "Settings"
];

function statusLabel(status: string) {
  if (status === "active") return "運作中";
  if (status === "warning") return "需注意";
  if (status === "error") return "錯誤";
  if (status === "success") return "成功";
  if (status === "pending") return "待確認";
  if (status === "paused") return "暫停";
  if (status === "draft") return "草稿";
  return "待命";
}

async function callSmartHome(action: "on" | "off") {
  const res = await fetch("/api/smart-home/light", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    alert("智慧家庭指令失敗：" + JSON.stringify(data));
    return;
  }

  alert(action === "on" ? "已送出開燈指令" : "已送出關燈指令");
}

export default function NuboV12Dashboard() {
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
          <div className="nubo-topbar-status">
            <span className="nubo-dot"></span>
            Ready
          </div>
        </header>

        <section className="nubo-hero-grid">
          <div className="nubo-core-card">
            <div className="nubo-core-wrap">
              <div className="nubo-orbit orbit-one"></div>
              <div className="nubo-orbit orbit-two"></div>
              <div className="nubo-core">
                <div className="nubo-core-inner">
                  <span>NUBO</span>
                  <small>Brain</small>
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
            </div>
          </div>

          <div className="nubo-panel nubo-briefing">
            <div className="nubo-panel-head">
              <h2>今日簡報</h2>
              <span>Briefing</span>
            </div>
            <p className="nubo-briefing-main">
              V12 已進入中控台模式。下一個關鍵任務是完成智慧家庭狀態驗證與自動化衝突檢查。
            </p>
            <div className="nubo-mini-grid">
              <div>
                <strong>8</strong>
                <span>Agents</span>
              </div>
              <div>
                <strong>3</strong>
                <span>Flows</span>
              </div>
              <div>
                <strong>2</strong>
                <span>Smart APIs</span>
              </div>
            </div>
          </div>

          <div className="nubo-panel nubo-smart-home">
            <div className="nubo-panel-head">
              <h2>智慧家庭</h2>
              <span>Smart Home</span>
            </div>
            <div className="nubo-device-card warning">
              <div>
                <strong>投射燈</strong>
                <p>IFTTT Webhook 已通；目前需排查自動關閉規則。</p>
              </div>
              <span>需確認</span>
            </div>
            <div className="nubo-action-row">
              <button onClick={() => callSmartHome("on")}>開燈</button>
              <button onClick={() => callSmartHome("off")}>關燈</button>
            </div>
          </div>
        </section>

        <section className="nubo-content-grid">
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
              <span>活動紀錄</span>
            </div>
            <div className="nubo-activity-list">
              {nuboActivities.map((activity) => (
                <div key={activity.id} className={`nubo-activity-item ${activity.status}`}>
                  <div className="nubo-activity-time">{activity.time}</div>
                  <div>
                    <strong>{activity.source} · {activity.action}</strong>
                    <p>{activity.detail}</p>
                  </div>
                  <span>{statusLabel(activity.status)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="nubo-panel">
            <div className="nubo-panel-head">
              <h2>System Health</h2>
              <span>狀態監控</span>
            </div>
            <div className="nubo-health-grid">
              <div><strong>Next.js</strong><span>Ready</span></div>
              <div><strong>Gemini</strong><span>Connected</span></div>
              <div><strong>Smart Home</strong><span>Webhook OK</span></div>
              <div><strong>IFTTT</strong><span>Fired OK</span></div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
