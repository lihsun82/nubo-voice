import NuboV12Shell from "@/components/v12/NuboV12Shell";

export default function SettingsPage() {
  return (
    <NuboV12Shell title="Settings 系統設定">
      <section className="nubo-page-grid">
        <div className="nubo-panel nubo-full-panel">
          <div className="nubo-panel-head">
            <h2>V12 Settings</h2>
            <span>Configuration</span>
          </div>

          <div className="nubo-table-like">
            <div className="nubo-setting-row">
              <strong>IFTTT_KEY</strong>
              <p>儲存在 .env.local。不要上傳 GitHub，不要貼到聊天裡。</p>
            </div>
            <div className="nubo-setting-row">
              <strong>TAPO_EVENT_ON</strong>
              <p>目前預設 tapo_p100_on。</p>
            </div>
            <div className="nubo-setting-row">
              <strong>TAPO_EVENT_OFF</strong>
              <p>目前預設 tapo_p100_off。</p>
            </div>
            <div className="nubo-setting-row">
              <strong>Home Assistant</strong>
              <p>下一階段建議導入，用於實體設備狀態回讀。</p>
            </div>
          </div>
        </div>
      </section>
    </NuboV12Shell>
  );
}
