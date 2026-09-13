"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "@/components/AgentWorkCenter.module.css";

type AgentRunSummary = {
  id: string;
  title: string;
  instruction: string;
  mode: "plan" | "execute";
  status: "running" | "planned" | "success" | "failed";
  requireComplete: boolean;
  createdAt: string;
  finishedAt: string | null;
  resultPreview: string;
  resultCharacterCount: number;
  error: string | null;
};

type AgentWorkResult = {
  plan?: {
    agents?: Array<{ id?: string; name?: string; role?: string }>;
    skills?: Array<{ id?: string; name?: string }>;
    steps?: string[];
  };
  result?: {
    text?: string;
    provider?: string;
    model?: string;
  } | null;
  validation?: {
    complete?: boolean;
    characterCount?: number;
    omissionLabels?: string[];
  } | null;
};

type AgentRunDetail = AgentRunSummary & {
  result: AgentWorkResult | null;
};

const statusLabels: Record<AgentRunSummary["status"], string> = {
  running: "執行中",
  planned: "已規劃",
  success: "已完成",
  failed: "失敗",
};

function formatTime(value: string | null) {
  if (!value) return "尚未完成";
  return new Date(value).toLocaleString("zh-TW", {
    hour12: false,
  });
}

function resultText(run: AgentRunDetail | null) {
  return run?.result?.result?.text?.trim() ?? "";
}

function statusClass(status: AgentRunSummary["status"]) {
  return `${styles.status} ${styles[status]}`;
}

export function AgentWorkCenter() {
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [selected, setSelected] = useState<AgentRunDetail | null>(null);
  const [status, setStatus] = useState("Agent交辦中心待命");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const loadingRunsRef = useRef(false);

  const loadRuns = useCallback(async () => {
    if (loadingRunsRef.current) return;
    loadingRunsRef.current = true;

    try {
      const response = await fetch("/api/agents/delegate?limit=10", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "無法讀取Agent交辦紀錄");
      }
      const nextRuns = Array.isArray(payload.runs)
        ? (payload.runs as AgentRunSummary[])
        : [];
      setRuns(nextRuns);
      setStatus(
        nextRuns.length > 0
          ? `已載入最近 ${nextRuns.length} 筆交辦工作`
          : "目前沒有Agent交辦紀錄",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "無法讀取Agent交辦紀錄",
      );
    } finally {
      loadingRunsRef.current = false;
    }
  }, []);

  const openRun = useCallback(async (id: string) => {
    setLoadingId(id);
    try {
      const response = await fetch(
        `/api/agents/delegate?id=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "無法讀取完整交辦成果");
      }
      setSelected(payload.run as AgentRunDetail);
      setStatus(`已開啟「${payload.run.title}」完整成果`);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "無法讀取完整交辦成果",
      );
    } finally {
      setLoadingId(null);
    }
  }, []);

  const copyResult = async () => {
    const text = resultText(selected);
    if (!text) {
      setStatus("這筆工作目前沒有可複製的成果");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus("完整成果已複製");
    } catch {
      setStatus("瀏覽器未允許複製，請長按成果文字手動複製");
    }
  };

  useEffect(() => {
    /*
     * NUBO_MOBILE_BACKGROUND_POLL_V1
     * 首頁先讓Gemini Live、麥克風與Token完成啟動，
     * Agent紀錄延後載入；手機輪詢由20秒降為90秒。
     */
    const mobile = window.matchMedia(
      "(pointer: coarse) and (max-width: 1100px)",
    ).matches;
    const initialDelay = mobile ? 2_500 : 1_200;
    const interval = mobile ? 90_000 : 60_000;

    const initialTimer = window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        void loadRuns();
      }
    }, initialDelay);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadRuns();
      }
    }, interval);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [loadRuns]);

  const plan = selected?.result?.plan;
  const validation = selected?.result?.validation;
  const text = resultText(selected);

  return (
    <section className={styles.center}>
      <div className={styles.heading}>
        <div>
          <div className="eyebrow">NUBO AGENT WORK CENTER</div>
          <h2>Agent 交辦中心</h2>
          <p>{status}</p>
        </div>
        <button className="secondary" onClick={() => void loadRuns()}>
          重新整理
        </button>
      </div>

      <div className={styles.layout}>
        <div className={styles.list} aria-label="Agent交辦紀錄">
          {runs.length === 0 ? (
            <p className={styles.empty}>
              對 NUBO 說：「交辦一項工作，幫我完整製作一份旅館營運報告。」
            </p>
          ) : (
            runs.map((run) => (
              <button
                type="button"
                className={`${styles.card} ${
                  selected?.id === run.id ? styles.selected : ""
                }`}
                key={run.id}
                onClick={() => void openRun(run.id)}
                disabled={loadingId === run.id}
              >
                <span className={styles.cardTop}>
                  <strong>{run.title}</strong>
                  <span className={statusClass(run.status)}>
                    {statusLabels[run.status]}
                  </span>
                </span>
                <span className={styles.instruction}>{run.instruction}</span>
                <span className={styles.meta}>
                  {formatTime(run.createdAt)} · {run.resultCharacterCount.toLocaleString()} 字
                </span>
              </button>
            ))
          )}
        </div>

        <div className={styles.resultPanel}>
          {!selected ? (
            <div className={styles.empty}>
              點選左側工作即可查看完整成果、Agent、Skill 與驗收結果。
            </div>
          ) : (
            <>
              <div className={styles.resultHeader}>
                <div>
                  <span className={statusClass(selected.status)}>
                    {statusLabels[selected.status]}
                  </span>
                  <h3>{selected.title}</h3>
                  <small>
                    建立：{formatTime(selected.createdAt)}｜完成：
                    {formatTime(selected.finishedAt)}
                  </small>
                </div>
                <button className="secondary" onClick={() => void copyResult()}>
                  複製成果
                </button>
              </div>

              <div className={styles.facts}>
                <div>
                  <span>Agent</span>
                  <strong>
                    {plan?.agents?.map((agent) => agent.name).filter(Boolean).join(" → ") ||
                      "未回傳"}
                  </strong>
                </div>
                <div>
                  <span>Skill</span>
                  <strong>
                    {plan?.skills?.map((skill) => skill.name).filter(Boolean).join("、") ||
                      "未回傳"}
                  </strong>
                </div>
                <div>
                  <span>完整性驗收</span>
                  <strong>
                    {validation?.complete === true
                      ? `通過（${validation.characterCount ?? text.length} 字）`
                      : selected.status === "failed"
                        ? "未通過"
                        : "等待驗收"}
                  </strong>
                </div>
                <div>
                  <span>AI 引擎</span>
                  <strong>
                    {[selected.result?.result?.provider, selected.result?.result?.model]
                      .filter(Boolean)
                      .join(" / ") || "未回傳"}
                  </strong>
                </div>
              </div>

              {selected.error ? (
                <div className={styles.error}>{selected.error}</div>
              ) : null}

              <div className={styles.body}>
                {text ||
                  (selected.mode === "plan"
                    ? "這筆工作為規劃模式，請查看Agent與Skill分派資訊。"
                    : "目前尚無成果內容。")}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
