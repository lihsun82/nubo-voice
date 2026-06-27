export default function NotFoundPage() {
  return (
    <main className="shell">
      <section className="console">
        <div className="status">
          <strong>找不到NUBO頁面</strong>
          <span>請回到主控台或確認網址是否正確。</span>
        </div>
        <div className="actions">
          <a className="primary" href="/">
            回到NUBO主控台
          </a>
        </div>
      </section>
    </main>
  );
}
