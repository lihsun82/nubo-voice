"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="shell">
      <section className="console">
        <div className="status">
          <strong>NUBO畫面載入失敗</strong>
          <span>請先重新整理，若仍失敗請重新啟動NUBO Server。</span>
        </div>
        <div className="error">
          {error?.message || "未知錯誤"}
          {error?.digest ? `\n錯誤代碼：${error.digest}` : ""}
        </div>
        <div className="actions">
          <button className="primary" onClick={reset}>
            重新載入NUBO
          </button>
        </div>
      </section>
    </main>
  );
}
