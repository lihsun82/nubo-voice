"use client";

import { useEffect, useState } from "react";
import NuboV12Shell from "@/components/v12/NuboV12Shell";

type AutomationStatus = "active" | "paused" | "draft";

type Automation = {
  id: string;
  name: string;
  description: string;
  status: AutomationStatus;
  riskLevel: "low" | "medium" | "high";
  steps: string[];
  createdAt: string;
};

function statusLabel(status: string) {
  if (status === "active") return "運作中";
  if (status === "paused") return "暫停";
  if (status === "draft") return "草稿";
  return "待命";
}

function riskLabel(risk: string) {
  if (risk === "low") return "低風險";
  if (risk === "medium") return "中風險";
  if (risk === "high") return "高風險";
  return "未分類";
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [name, setName] = useState("每日 NUBO 系統檢查");
  const [description, setDescription] = useState("檢查 NUBO API、智慧家庭、Logs、Notifications 是否正常。");
  const [riskLevel, setRiskLevel] = useState<"low" | "medium" | "high">("low");
  const [steps, setSteps] = useState("Schedule, Health Check, Brain, Notify, Log");
  const [message, setMessage] = useState("等待操作");
  const [runAction, setRunAction] = useState<"on" | "off">("on");

  async function loadAutomations() {
    const res = await fetch("/api/v12/automations", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setAutomations(Array.isArray(data.automations) ? data.automations : []);
  }

  useEffect(() => {
    loadAutomations();
  }, []);

  async function createNewAutomation() {
    setMessage("正在建立 automation...");

    const res = await fetch("/api/v12/automations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        description,
        riskLevel,
        steps,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMessage(data.message || data.error || "建立失敗");
      return;
    }

    setMessage(`已建立：${data.automation?.name || name}`);
    await loadAutomations();
  }

  async function updateStatus(id: string, status: AutomationStatus) {
    const res = await fetch("/api/v12/automations", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, status }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMessage(data.message || data.error || "更新失敗");
      return;
    }

    setMessage(`已更新：${data.automation?.name || id} → ${statusLabel(status)}`);
    await loadAutomations();
  }

  async function removeAutomation(id: string) {
    const res = await fetch("/api/v12/automations", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMessage(data.message || data.error || "刪除失敗");
      return;
    }

    setMessage(data.deleted ? "已刪除 automation" : "找不到 automation");
    await loadAutomations();
  }

  async function runAutomation(automation: Automation, approvalMode?: "approved" | "double") {
    setMessage(`正在執行：${automation.name}`);

    const payload: any = {
      id: automation.id,
      action: runAction
    };

    if (approvalMode === "approved") {
      payload.approved = true;
    }

    if (approvalMode === "double") {
      payload.doubleConfirmed = true;
      payload.approved = true;
    }

    const res = await fetch("/api/v12/automations/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setMessage(data.message || data.error || "執行失敗");
      return;
    }

    if (data.requiresApproval) {
      setMessage(`需要確認：${automation.name}`);
      return;
    }

    if (data.requiresDoubleConfirm) {
      setMessage(`需要二次確認：${automation.name}`);
      return;
    }

    setMessage(data.message || "Automation 已執行");
  }

  return (
    <NuboV12Shell title="Automations 工作流程">
      <section className="nubo-page-grid">
        <div className="nubo-panel nubo-full-panel">
          <div className="nubo-panel-head">
            <h2>Automation Builder</h2>
            <span>可編輯流程</span>
          </div>

          <div className="nubo-builder-form">
            <label>
              流程名稱
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>

            <label>
              描述
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>

            <label>
              風險等級
              <select value={riskLevel} onChange={(event) => setRiskLevel(event.target.value as any)}>
                <option value="low">低風險：可直接執行</option>
                <option value="medium">中風險：需要確認</option>
                <option value="high">高風險：需要二次確認</option>
              </select>
            </label>

            <label>
              流程步驟，以逗號分隔
              <input value={steps} onChange={(event) => setSteps(event.target.value)} />
            </label>

            <label>
              Smart Home 執行動作
              <select value={runAction} onChange={(event) => setRunAction(event.target.value as any)}>
                <option value="on">開燈 / on</option>
                <option value="off">關燈 / off</option>
              </select>
            </label>

            <div className="nubo-action-row">
              <button onClick={createNewAutomation}>新增 Automation</button>
              <button onClick={loadAutomations}>重新整理</button>
            </div>

            <p className="nubo-live-message">{message}</p>
          </div>
        </div>

        <div className="nubo-panel nubo-full-panel">
          <div className="nubo-panel-head">
            <h2>Automation Registry</h2>
            <span>{automations.length} flows</span>
          </div>

          <div className="nubo-flow-list">
            {automations.length === 0 ? (
              <div className="nubo-empty-state">尚無 automation。</div>
            ) : (
              automations.map((automation) => (
                <div key={automation.id} className="nubo-flow-card">
                  <div className="nubo-flow-title">
                    <strong>{automation.name}</strong>
                    <span>{statusLabel(automation.status)} · {riskLabel(automation.riskLevel)}</span>
                  </div>

                  <p>{automation.description}</p>

                  <div className="nubo-flow-steps">
                    {automation.steps.map((step) => (
                      <span key={step}>{step}</span>
                    ))}
                  </div>

                  <div className="nubo-automation-actions">
                    <button onClick={() => runAutomation(automation)}>Run</button>
                    <button onClick={() => runAutomation(automation, "approved")}>Run + 確認</button>
                    <button onClick={() => runAutomation(automation, "double")}>Run + 二次確認</button>
                    <button onClick={() => updateStatus(automation.id, "active")}>啟用</button>
                    <button onClick={() => updateStatus(automation.id, "paused")}>暫停</button>
                    <button onClick={() => updateStatus(automation.id, "draft")}>草稿</button>
                    <button className="danger" onClick={() => removeAutomation(automation.id)}>刪除</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="nubo-panel">
          <div className="nubo-panel-head">
            <h2>執行規則</h2>
            <span>Gated Tasks</span>
          </div>
          <p>低風險直接執行；中風險需要確認；高風險需要二次確認與活動紀錄。</p>
        </div>

        <div className="nubo-panel">
          <div className="nubo-panel-head">
            <h2>Executor 狀態</h2>
            <span>V12.7</span>
          </div>
          <p>目前支援手動 Run。Smart Home 類流程會實際呼叫智慧家庭 API；其他流程先以模擬執行並寫入紀錄。</p>
        </div>
      </section>
    </NuboV12Shell>
  );
}
