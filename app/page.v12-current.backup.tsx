"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Automation = {
  id: string;
  name: string;
  description: string;
  status: string;
  riskLevel: string;
  steps: string[];
};

type VoiceState = "idle" | "listening" | "thinking" | "executing" | "success" | "error";

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

function stateLabel(state: VoiceState) {
  if (state === "idle") return "待命";
  if (state === "listening") return "聆聽中";
  if (state === "thinking") return "思考中";
  if (state === "executing") return "執行中";
  if (state === "success") return "完成";
  if (state === "error") return "錯誤";
  return "待命";
}

function detectVoiceAction(text: string): "on" | "off" | null {
  const raw = text.toLowerCase();

  if (
    raw.includes("開燈") ||
    raw.includes("打開燈") ||
    raw.includes("打開投射燈") ||
    raw.includes("開投射燈") ||
    raw.includes("turn on") ||
    raw.includes("light on")
  ) {
    return "on";
  }

  if (
    raw.includes("關燈") ||
    raw.includes("關掉燈") ||
    raw.includes("關閉燈") ||
    raw.includes("關掉投射燈") ||
    raw.includes("關閉投射燈") ||
    raw.includes("turn off") ||
    raw.includes("light off")
  ) {
    return "off";
  }

  return null;
}

export default function Home() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [message, setMessage] = useState("NUBO V12 中控台已就緒");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [loading, setLoading] = useState(false);
  const [lastAction, setLastAction] = useState("等待指令");
  const [transcript, setTranscript] = useState("尚未收到語音");
  const [voiceSupported, setVoiceSupported] = useState(true);

  const recognitionRef = useRef<any>(null);

  const activeCount = useMemo(
    () => automations.filter((item) => item.status === "active").length,
    [automations]
  );

  async function loadAutomations() {
    try {
      const res = await fetch("/api/v12/automations", { cache: "no-store" });
      const data = await res.json();
      setAutomations(Array.isArray(data.automations) ? data.automations : []);
      setMessage("Automations 已同步");
    } catch {
      setMessage("讀取 Automations 失敗");
      setVoiceState("error");
    }
  }

  async function runLight(action: "on" | "off") {
    setLoading(true);
    setVoiceState("executing");
    setLastAction(action === "on" ? "開啟投射燈" : "關閉投射燈");
    setMessage(action === "on" ? "正在送出開燈指令..." : "正在送出關燈指令...");

    try {
      const res = await fetch("/api/v12/automations/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: "auto_light_control",
          action
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setVoiceState("error");
        setMessage(data.message || data.error || "Automation 執行失敗");
        return;
      }

      setVoiceState("success");
      setMessage(data.message || "Automation 已執行");
      await loadAutomations();

      window.setTimeout(() => {
        setVoiceState("idle");
      }, 1400);
    } catch {
      setVoiceState("error");
      setMessage("無法連線到 Automation Executor");
    } finally {
      setLoading(false);
    }
  }

  function speak(text: string) {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-TW";
      utterance.rate = 1;
      utterance.pitch = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore browser speech errors
    }
  }

  function startVoice() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceSupported(false);
      setVoiceState("error");
      setMessage("此瀏覽器不支援語音辨識。請用 Chrome 或 Edge。");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "zh-TW";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setVoiceState("listening");
      setMessage("我在聽，請說：開燈 或 關燈");
      setTranscript("聆聽中...");
    };

    recognition.onerror = (event: any) => {
      setVoiceState("error");
      setMessage(`語音辨識錯誤：${event.error || "unknown"}`);
      setTranscript("語音辨識失敗。請確認麥克風權限。");
    };

    recognition.onend = () => {
      if (voiceState === "listening") {
        setVoiceState("idle");
      }
    };

    recognition.onresult = async (event: any) => {
      const text = String(event.results?.[0]?.[0]?.transcript || "").trim();
      setTranscript(text || "沒有辨識到內容");

      if (!text) {
        setVoiceState("idle");
        setMessage("沒有聽清楚，請再說一次。");
        return;
      }

      setVoiceState("thinking");
      setMessage(`我聽到：「${text}」`);

      const action = detectVoiceAction(text);

      if (!action) {
        setVoiceState("idle");
        setLastAction("未支援指令");
        setMessage("我聽到了，但目前只支援開燈與關燈。");
        speak("我聽到了，但目前只支援開燈與關燈。");
        return;
      }

      speak(action === "on" ? "已收到，正在開燈。" : "已收到，正在關燈。");
      await runLight(action);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopVoice() {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }

    setVoiceState("idle");
    setMessage("語音已停止");
  }

  useEffect(() => {
    loadAutomations();

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    setVoiceSupported(Boolean(SpeechRecognition));
  }, []);

  return (
    <main style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.brandRow}>
          <div style={styles.brandMark}>N</div>
          <div>
            <div style={styles.brandTitle}>NUBO</div>
            <div style={styles.brandSub}>Automation OS V12</div>
          </div>
        </div>

        <nav style={styles.nav}>
          {[
            "Dashboard",
            "Voice Core",
            "Automations",
            "Smart Home",
            "Agents",
            "Logs",
            "Settings"
          ].map((item, index) => (
            <div
              key={item}
              style={{
                ...styles.navItem,
                ...(index === 0 ? styles.navItemActive : {})
              }}
            >
              {item}
            </div>
          ))}
        </nav>

        <div style={styles.sideStatus}>
          <div style={styles.smallLabel}>System</div>
          <div style={styles.systemPill}>Online · 127.0.0.1</div>
        </div>
      </aside>

      <section style={styles.main}>
        <header style={styles.topbar}>
          <div>
            <div style={styles.eyebrow}>AI AUTOMATION COMMAND CENTER</div>
            <h1 style={styles.title}>NUBO V12 中控台</h1>
          </div>

          <div style={styles.statusPill}>
            <span style={styles.dot}></span>
            {stateLabel(voiceState)}
          </div>
        </header>

        <section style={styles.heroGrid}>
          <div style={styles.coreCard}>
            <div style={styles.coreWrap}>
              <div style={styles.orbitOne}></div>
              <div style={styles.orbitTwo}></div>
              <div style={{
                ...styles.core,
                ...(voiceState === "listening" ? styles.coreListening : {}),
                ...(voiceState === "thinking" ? styles.coreThinking : {}),
                ...(voiceState === "executing" ? styles.coreExecuting : {}),
                ...(voiceState === "success" ? styles.coreSuccess : {}),
                ...(voiceState === "error" ? styles.coreError : {})
              }}>
                <div style={styles.coreInner}>
                  <span style={styles.coreText}>NUBO</span>
                  <small>{stateLabel(voiceState)}</small>
                </div>
              </div>

              <div style={{ ...styles.agentNode, top: 30, left: 28 }}>Research</div>
              <div style={{ ...styles.agentNode, top: 30, right: 28 }}>Home</div>
              <div style={{ ...styles.agentNode, bottom: 34, left: 42 }}>Ops</div>
              <div style={{ ...styles.agentNode, bottom: 34, right: 42 }}>Memory</div>
            </div>

            <div>
              <h2 style={styles.panelTitle}>中央 AI 主腦</h2>
              <p style={styles.muted}>
                負責語音理解、Automation Executor、Smart Home 控制與狀態回報。
              </p>
              <div style={styles.liveMessage}>{message}</div>
            </div>
          </div>

          <div style={styles.panel}>
            <div style={styles.panelHead}>
              <h2 style={styles.panelTitle}>Voice Core</h2>
              <span style={styles.panelTag}>{voiceSupported ? "Browser Mic" : "Not Supported"}</span>
            </div>

            <div style={styles.transcriptBox}>
              <div style={styles.smallLabel}>辨識內容</div>
              <strong>{transcript}</strong>
            </div>

            <div style={styles.actionRow}>
              <button
                style={styles.primaryButton}
                disabled={!voiceSupported || loading}
                onClick={startVoice}
              >
                啟動語音
              </button>
              <button
                style={styles.secondaryButton}
                onClick={stopVoice}
              >
                停止
              </button>
            </div>

            <p style={styles.muted}>
              請說：「開燈」、「關燈」、「打開投射燈」、「關掉投射燈」。
            </p>
          </div>

          <div style={styles.panel}>
            <div style={styles.panelHead}>
              <h2 style={styles.panelTitle}>Smart Home</h2>
              <span style={styles.panelTag}>IFTTT / Tapo</span>
            </div>

            <div style={styles.deviceCard}>
              <div>
                <strong>投射燈</strong>
                <p style={styles.muted}>
                  目前透過 Automation Executor 呼叫 Smart Home API。
                </p>
              </div>
              <span style={styles.deviceTag}>Ready</span>
            </div>

            <div style={styles.actionRow}>
              <button
                style={styles.primaryButton}
                disabled={loading}
                onClick={() => runLight("on")}
              >
                開燈
              </button>
              <button
                style={styles.secondaryButton}
                disabled={loading}
                onClick={() => runLight("off")}
              >
                關燈
              </button>
            </div>
          </div>
        </section>

        <section style={styles.contentGrid}>
          <div style={styles.panelWide}>
            <div style={styles.panelHead}>
              <h2 style={styles.panelTitle}>Automation Registry</h2>
              <span style={styles.panelTag}>{automations.length} flows</span>
            </div>

            <div style={styles.flowList}>
              {automations.length === 0 ? (
                <div style={styles.emptyState}>尚未讀到 automation。</div>
              ) : (
                automations.map((item) => (
                  <div key={item.id} style={styles.flowCard}>
                    <div style={styles.flowTitle}>
                      <strong>{item.name}</strong>
                      <span style={styles.flowStatus}>
                        {item.status} · {item.riskLevel}
                      </span>
                    </div>
                    <p style={styles.muted}>{item.description}</p>
                    <div style={styles.stepRow}>
                      {(item.steps || []).map((step) => (
                        <span key={step} style={styles.stepPill}>
                          {step}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={styles.panel}>
            <div style={styles.panelHead}>
              <h2 style={styles.panelTitle}>System Metrics</h2>
              <span style={styles.panelTag}>Live</span>
            </div>

            <div style={styles.metricGrid}>
              <div style={styles.metricBox}>
                <strong style={styles.metricNumber}>{automations.length}</strong>
                <span>Automations</span>
              </div>
              <div style={styles.metricBox}>
                <strong style={styles.metricNumber}>{activeCount}</strong>
                <span>Active</span>
              </div>
              <div style={styles.metricBox}>
                <strong style={styles.metricNumber}>2</strong>
                <span>Routes OK</span>
              </div>
            </div>
          </div>

          <div style={styles.panel}>
            <div style={styles.panelHead}>
              <h2 style={styles.panelTitle}>Next Step</h2>
              <span style={styles.panelTag}>Wake Word</span>
            </div>
            <p style={styles.muted}>
              下一步會做「ha nubo」喚醒詞與連續聆聽模式。
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "260px 1fr",
    background:
      "radial-gradient(circle at 40% 0%, rgba(56,189,248,.22), transparent 34%), #020617",
    color: "#e5f4ff",
    fontFamily: "Arial, sans-serif"
  },
  sidebar: {
    borderRight: "1px solid rgba(148,163,184,.18)",
    background: "rgba(2,6,23,.72)",
    padding: 22,
    display: "flex",
    flexDirection: "column",
    gap: 24
  },
  brandRow: {
    display: "flex",
    gap: 12,
    alignItems: "center"
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(135deg, #38bdf8, #8b5cf6)",
    color: "white",
    fontWeight: 900
  },
  brandTitle: {
    fontWeight: 900,
    letterSpacing: 2
  },
  brandSub: {
    color: "#94a3b8",
    fontSize: 12
  },
  nav: {
    display: "grid",
    gap: 8
  },
  navItem: {
    border: "1px solid transparent",
    borderRadius: 14,
    padding: "11px 12px",
    color: "#94a3b8"
  },
  navItemActive: {
    color: "#e5f4ff",
    borderColor: "rgba(56,189,248,.32)",
    background: "rgba(56,189,248,.12)"
  },
  sideStatus: {
    marginTop: "auto",
    display: "grid",
    gap: 8
  },
  smallLabel: {
    fontSize: 12,
    color: "#64748b"
  },
  systemPill: {
    border: "1px solid rgba(34,197,94,.28)",
    borderRadius: 999,
    padding: "9px 12px",
    color: "#bbf7d0",
    background: "rgba(34,197,94,.08)"
  },
  main: {
    padding: 28,
    display: "grid",
    gap: 22
  },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  eyebrow: {
    color: "#38bdf8",
    letterSpacing: 2,
    fontSize: 12
  },
  title: {
    margin: "8px 0 0",
    fontSize: 34
  },
  statusPill: {
    border: "1px solid rgba(56,189,248,.32)",
    borderRadius: 999,
    padding: "10px 14px",
    display: "flex",
    gap: 8,
    alignItems: "center",
    color: "#bae6fd"
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "#22c55e",
    boxShadow: "0 0 18px #22c55e"
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "1.25fr .8fr .8fr",
    gap: 18
  },
  coreCard: {
    border: "1px solid rgba(148,163,184,.2)",
    borderRadius: 26,
    padding: 24,
    background: "rgba(15,23,42,.72)",
    display: "grid",
    gridTemplateColumns: "320px 1fr",
    gap: 24,
    boxShadow: "0 0 70px rgba(56,189,248,.1)"
  },
  coreWrap: {
    position: "relative",
    height: 320
  },
  orbitOne: {
    position: "absolute",
    inset: 34,
    border: "1px solid rgba(56,189,248,.25)",
    borderRadius: "50%"
  },
  orbitTwo: {
    position: "absolute",
    inset: 68,
    border: "1px solid rgba(139,92,246,.26)",
    borderRadius: "50%"
  },
  core: {
    position: "absolute",
    inset: 98,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    background:
      "radial-gradient(circle at 35% 25%, #e0f2fe, #38bdf8 22%, #2563eb 48%, #581c87 82%)",
    boxShadow:
      "0 0 45px rgba(56,189,248,.75), 0 0 110px rgba(139,92,246,.38)"
  },
  coreListening: {
    boxShadow:
      "0 0 60px rgba(56,189,248,.95), 0 0 140px rgba(56,189,248,.5)"
  },
  coreThinking: {
    boxShadow:
      "0 0 55px rgba(139,92,246,.92), 0 0 130px rgba(139,92,246,.48)"
  },
  coreExecuting: {
    boxShadow:
      "0 0 55px rgba(250,204,21,.88), 0 0 130px rgba(250,204,21,.42)"
  },
  coreSuccess: {
    boxShadow:
      "0 0 55px rgba(34,197,94,.88), 0 0 130px rgba(34,197,94,.42)"
  },
  coreError: {
    boxShadow:
      "0 0 55px rgba(248,113,113,.88), 0 0 130px rgba(248,113,113,.42)"
  },
  coreInner: {
    display: "grid",
    gap: 4,
    textAlign: "center",
    color: "white"
  },
  coreText: {
    fontWeight: 900,
    letterSpacing: 2
  },
  agentNode: {
    position: "absolute",
    border: "1px solid rgba(56,189,248,.28)",
    borderRadius: 999,
    padding: "8px 12px",
    background: "rgba(2,6,23,.72)",
    color: "#bae6fd",
    fontSize: 12
  },
  panel: {
    border: "1px solid rgba(148,163,184,.2)",
    borderRadius: 24,
    padding: 20,
    background: "rgba(15,23,42,.72)"
  },
  panelWide: {
    gridColumn: "span 1",
    border: "1px solid rgba(148,163,184,.2)",
    borderRadius: 24,
    padding: 20,
    background: "rgba(15,23,42,.72)"
  },
  panelHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 14
  },
  panelTitle: {
    margin: 0,
    fontSize: 20
  },
  panelTag: {
    color: "#38bdf8",
    fontSize: 12
  },
  muted: {
    color: "#cbd5e1",
    lineHeight: 1.6
  },
  liveMessage: {
    border: "1px solid rgba(56,189,248,.22)",
    borderRadius: 16,
    padding: 12,
    marginTop: 14,
    color: "#dff7ff",
    background: "rgba(56,189,248,.08)"
  },
  transcriptBox: {
    border: "1px solid rgba(56,189,248,.22)",
    borderRadius: 16,
    padding: 14,
    background: "rgba(2,6,23,.42)",
    display: "grid",
    gap: 8
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10
  },
  metricBox: {
    border: "1px solid rgba(148,163,184,.16)",
    borderRadius: 16,
    padding: 12,
    background: "rgba(2,6,23,.38)",
    display: "grid",
    gap: 4
  },
  metricNumber: {
    fontSize: 24,
    color: "#38bdf8"
  },
  deviceCard: {
    border: "1px solid rgba(34,197,94,.22)",
    borderRadius: 18,
    padding: 14,
    background: "rgba(34,197,94,.08)",
    display: "flex",
    justifyContent: "space-between",
    gap: 12
  },
  deviceTag: {
    color: "#bbf7d0",
    fontSize: 12
  },
  actionRow: {
    display: "flex",
    gap: 10,
    marginTop: 14
  },
  primaryButton: {
    border: "1px solid rgba(56,189,248,.5)",
    borderRadius: 999,
    padding: "10px 16px",
    background: "rgba(56,189,248,.16)",
    color: "#e0f2fe",
    cursor: "pointer"
  },
  secondaryButton: {
    border: "1px solid rgba(148,163,184,.28)",
    borderRadius: 999,
    padding: "10px 16px",
    background: "rgba(255,255,255,.05)",
    color: "#e2e8f0",
    cursor: "pointer"
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "1.2fr .8fr .8fr",
    gap: 18
  },
  flowList: {
    display: "grid",
    gap: 12
  },
  flowCard: {
    border: "1px solid rgba(148,163,184,.18)",
    borderRadius: 18,
    padding: 16,
    background: "rgba(2,6,23,.42)"
  },
  flowTitle: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12
  },
  flowStatus: {
    color: "#38bdf8",
    fontSize: 12
  },
  stepRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8
  },
  stepPill: {
    border: "1px solid rgba(56,189,248,.28)",
    borderRadius: 999,
    padding: "6px 10px",
    color: "#bae6fd",
    fontSize: 12
  },
  emptyState: {
    border: "1px dashed rgba(148,163,184,.24)",
    borderRadius: 18,
    padding: 18,
    color: "#94a3b8"
  }
};
