"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NuboNotice, NuboTask, TaskRun } from "@/lib/task-types";

type TaskPayload = {
  tasks: NuboTask[];
  runs: TaskRun[];
  inbox: NuboNotice[];
};

const emptyPayload: TaskPayload = { tasks: [], runs: [], inbox: [] };

export function TaskCenter() {
  const [data, setData] = useState<TaskPayload>(emptyPayload);
  const [status, setStatus] = useState("載入任務中");
  const [busyId, setBusyId] = useState<string | null>(null);
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
