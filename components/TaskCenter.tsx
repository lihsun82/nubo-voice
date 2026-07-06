"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NuboNotice, NuboTask, TaskRun } from "@/lib/task-types";

type TaskPayload = {
  tasks: NuboTask[];
  runs: TaskRun[];
  inbox: NuboNotice[];
};

type OrchestratorPlan = {
  id: string;
  title: string;
  summary: string;
  taskKind: string;
  agents: string[];
  steps: Array<{
    id: string;
    agent: string;
    action: string;
    expectedOutput: string;
  }>;
  acceptanceCriteria: string[];
  guardrails: string[];
  blockedActions: string[];
  riskLevel: "L1" | "L2" | "L3" | "L4";
  riskReason: string;
  canAutoCreateTask: boolean;
  confidence: number;
};

type OrchestratorResponse = {
  ok: boolean;
  plan: OrchestratorPlan;
  task: NuboTask | null;
  blocked?: boolean;
  reason?: string;
  error?: string;
};

const emptyPayload: TaskPayload = { tasks: [], runs: [], inbox: [] };

export function TaskCenter() {
  const [data, setData] = useState<TaskPayload>(emptyPayload);
  const [status, setStatus] = useState("載入任務中");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [orchestratorText, setOrchestratorText] = useState("");
  const [orchestratorPlan, setOrchestratorPlan] = useState<OrchestratorPlan | null>(null);
  const [orchestratorStatus, setOrchestratorStatus] = useState("輸入任務，NUBO 會先拆解、分級、列出驗收條件。");
  const [orchestratorBusy, setOrchestratorBusy] = useState(false);
  const activeIds = useRef(new Set<string>());
  const seenInbox = useRef(new Set<string>());

  const load = useCallback(async () => {
    const response = await fetch("/api/tasks", { cache: "no-store" });
    if (!response.ok) throw new Error("無法讀取任務中心");
    const payload = (await response.json()) as TaskPayload;
    setData(payload);
    setStatus(`已載入 ${payload.tasks.length} 個任務`);

    for (const item of payload.inbox) {
      if (seenInbox.current.has(item.id)) continue;
      seenInbox.current.add(item.id);
      if (item.read || Notification.permission !== "granted") continue;
      new Notification(item.title, { body: item.message.slice(0, 180) });
    }
    return payload;
  }, []);

  const action = useCallback(
    async (taskAction: "run" | "pause" | "resume", id: string) => {
      setBusyId(id);
      try {
        const response = await fetch("/api/tasks/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: taskAction, id }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "操作失敗");
        await load();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "操作失敗");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const orchestrate = useCallback(
    async (createTask: boolean) => {
      const instruction = orchestratorText.trim();
      if (!instruction) {
        setOrchestratorStatus("請先輸入任務內容");
        return;
      }

      setOrchestratorBusy(true);
      try {
        const response = await fetch("/api/orchestrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction, createTask }),
        });
        const result = (await response.json()) as OrchestratorResponse;
        if (!response.ok) throw new Error(result.error ?? "任務指揮中心失敗");
        setOrchestratorPlan(result.plan);
        if (result.blocked) {
          setOrchestratorStatus(result.reason ?? "此任務需要人工確認後才能建立");
        } else if (result.task) {
          setOrchestratorStatus("已建立一次性任務；第二階段會依代理人步驟執行，必要時產生檔案下載連結。");
          await load();
        } else {
          setOrchestratorStatus("已完成任務拆解，確認後可建立一次性任務");
        }
      } catch (error) {
        setOrchestratorStatus(error instanceof Error ? error.message : "任務指揮中心失敗");
      } finally {
        setOrchestratorBusy(false);
      }
    },
    [load, orchestratorText],
  );

  const checkDue = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const payload = await load();
    const now = Date.now();
    const due = payload.tasks
      .filter(
        (task) =>
          task.status === "active" &&
          task.nextRunAt !== null &&
          new Date(task.nextRunAt).getTime() <= now &&
          !activeIds.current.has(task.id),
      )
      .slice(0, 3);

    for (const task of due) {
      activeIds.current.add(task.id);
      try {
        await fetch("/api/tasks/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "run", id: task.id }),
        });
      } finally {
        activeIds.current.delete(task.id);
      }
    }
    if (due.length > 0) await load();
  }, [load]);

  useEffect(() => {
    void checkDue();
    const timer = window.setInterval(() => void checkDue(), 30_000);
    return () => window.clearInterval(timer);
  }, [checkDue]);

  const enableBrowserNotice = async () => {
    if (!("Notification" in window)) {
      setStatus("這個瀏覽器不支援桌面通知");
      return;
    }
    const permission = await Notification.requestPermission();
    setStatus(permission === "granted" ? "桌面通知已啟用" : "桌面通知未獲允許");
  };

  return (
    <section className="task-center">
      <div className="task-heading">
        <div>
          <div className="eyebrow">NUBO TASK CENTER</div>
          <h2>工作與追蹤</h2>
          <p>{status}</p>
        </div>
        <button className="secondary" onClick={enableBrowserNotice}>
          啟用桌面通知
        </button>
      </div>

      <div className="orchestrator-panel task-panel">
        <div className="task-card-top">
          <div>
            <div className="eyebrow">TASK ORCHESTRATOR V2</div>
            <h3>任務指揮中心</h3>
          </div>
          <span className="badge active">Phase 2</span>
        </div>
        <p className="empty">第二階段啟用固定內部代理人池，會依 Planner / Research / Data / Report / Mail / Coding / QA / Device 步驟逐步產出；L3/L4 仍只產生計畫，不會自動執行。</p>
        <textarea
          className="orchestrator-input"
          value={orchestratorText}
          onChange={(event) => setOrchestratorText(event.target.value)}
          placeholder="例如：幫我整理明天旅館市場雷達，產出重點摘要與 PDF/HTML 檔案需求，成功後放到收件匣。"
          rows={4}
        />
        <div className="task-actions">
          <button onClick={() => void orchestrate(false)} disabled={orchestratorBusy}>
            先拆解任務
          </button>
          <button
            onClick={() => void orchestrate(true)}
            disabled={orchestratorBusy || Boolean(orchestratorPlan && !orchestratorPlan.canAutoCreateTask)}
          >
            建立一次性任務
          </button>
        </div>
        <small>{orchestratorStatus}</small>

        {orchestratorPlan ? (
          <article className="task-card orchestrator-result">
            <div className="task-card-top">
              <strong>{orchestratorPlan.title}</strong>
              <span className={`badge ${orchestratorPlan.riskLevel.toLowerCase()}`}>{orchestratorPlan.riskLevel}</span>
            </div>
            <p>{orchestratorPlan.summary}</p>
            <small>代理人：{orchestratorPlan.agents.join("、")}｜信心：{Math.round(orchestratorPlan.confidence * 100)}%</small>
            <ol>
              {orchestratorPlan.steps.map((step) => (
                <li key={step.id}>
                  <strong>{step.agent}</strong>：{step.action}
                </li>
              ))}
            </ol>
            <details>
              <summary>驗收與保護規則</summary>
              <b>驗收條件</b>
              <ul>
                {orchestratorPlan.acceptanceCriteria.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <b>禁止動作</b>
              <ul>
                {orchestratorPlan.blockedActions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </article>
        ) : null}
      </div>

      <div className="task-grid">
        <div className="task-panel">
          <h3>任務清單</h3>
          {data.tasks.length === 0 ? (
            <p className="empty">直接對 NUBO 說：「每天早上九點幫我整理旅館業新聞。」</p>
          ) : (
            data.tasks.map((task) => (
              <article className="task-card" key={task.id}>
                <div className="task-card-top">
                  <strong>{task.title}</strong>
                  <span className={`badge ${task.status}`}>{task.status}</span>
                </div>
                <p>{task.instruction}</p>
                <small>
                  下次：{task.nextRunAt ? new Date(task.nextRunAt).toLocaleString("zh-TW") : "無"}
                </small>
                <div className="task-actions">
                  <button
                    onClick={() => void action("run", task.id)}
                    disabled={busyId === task.id}
                  >
                    立即執行
                  </button>
                  {task.status === "paused" ? (
                    <button onClick={() => void action("resume", task.id)}>恢復</button>
                  ) : task.status === "active" ? (
                    <button onClick={() => void action("pause", task.id)}>暫停</button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>

        <div className="task-panel">
          <h3>NUBO 收件匣</h3>
          {data.inbox.length === 0 ? (
            <p className="empty">完成的提醒、報告與條件命中結果會出現在這裡。</p>
          ) : (
            data.inbox.map((item) => (
              <article className="inbox-card" key={item.id}>
                <strong>{item.title}</strong>
                <p>{item.message}</p>
                <small>{new Date(item.createdAt).toLocaleString("zh-TW")}</small>
              </article>
            ))
          )}
        </div>
      </div>

      <details className="run-history">
        <summary>最近執行紀錄</summary>
        {data.runs.map((run) => (
          <div key={run.id} className="run-row">
            <span>{run.status}</span>
            <span>{new Date(run.startedAt).toLocaleString("zh-TW")}</span>
            <span>{run.error ?? run.output?.slice(0, 100) ?? "處理中"}</span>
          </div>
        ))}
      </details>
    </section>
  );
}
