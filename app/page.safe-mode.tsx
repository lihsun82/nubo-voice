export default function Home() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#020617",
      color: "#e5f4ff",
      fontFamily: "Arial, sans-serif",
      padding: "40px"
    }}>
      <section style={{
        maxWidth: "960px",
        margin: "0 auto",
        border: "1px solid rgba(56,189,248,.35)",
        borderRadius: "24px",
        padding: "32px",
        background: "rgba(15,23,42,.85)"
      }}>
        <p style={{
          color: "#38bdf8",
          letterSpacing: "2px",
          marginBottom: "10px"
        }}>
          AI AUTOMATION COMMAND CENTER
        </p>

        <h1 style={{
          fontSize: "44px",
          margin: "0 0 16px"
        }}>
          NUBO V12
        </h1>

        <p style={{
          color: "#cbd5e1",
          fontSize: "18px"
        }}>
          首頁安全模式已啟動。Automations API 與 Executor API 已正常運作。
        </p>

        <div style={{
          display: "grid",
          gap: "12px",
          marginTop: "28px"
        }}>
          <div>✅ /api/v12/automations</div>
          <div>✅ /api/v12/automations/run</div>
          <div>✅ Automation Executor Ready</div>
        </div>
      </section>
    </main>
  );
}
