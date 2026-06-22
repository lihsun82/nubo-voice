export default function ActionReadyPage() {
  return (
    <main className="action-ready-shell">
      <section className="action-ready-card">
        <div className="action-ready-orb" />
        <div className="eyebrow">NUBO ACTION WINDOW</div>
        <h1>已取得瀏覽器控制權</h1>
        <p>
          這個視窗會等待語音指令，之後可直接開啟Facebook、Gmail、Google Maps與指定網址。
        </p>
        <small>請不要關閉此視窗；NUBO會在需要時自動切換內容。</small>
      </section>
    </main>
  );
}
