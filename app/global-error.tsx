"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-Hant">
      <body>
        <main className="shell">
          <section className="console">
            <div className="status">
              <strong>NUBO系統畫面發生錯誤</strong>
              <span>這通常是開發快取或前端元件錯誤造成。請先重新載入。</span>
            </div>
            <pre className="error">{error?.message || "未知錯誤"}</pre>
            <div className="actions">
              <button className="primary" onClick={reset}>
                重新載入
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
