import NuboV12Shell from "@/components/v12/NuboV12Shell";
import { nuboAgents } from "@/lib/v12/nubo-v12-data";

function statusLabel(status: string) {
  if (status === "active") return "運作中";
  if (status === "warning") return "需注意";
  if (status === "error") return "錯誤";
  return "待命";
}

export default function AgentsPage() {
  return (
    <NuboV12Shell title="Agents 多代理人系統">
      <section className="nubo-page-grid">
        <div className="nubo-panel nubo-full-panel">
          <div className="nubo-panel-head">
            <h2>Agent Registry</h2>
            <span>角色分工</span>
          </div>

          <div className="nubo-agent-list">
            {nuboAgents.map((agent) => (
              <div key={agent.id} className={`nubo-agent-card ${agent.status}`}>
                <div>
                  <strong>{agent.name}</strong>
                  <span>{agent.role}</span>
                </div>
                <p>{agent.description}</p>
                <em>{statusLabel(agent.status)}</em>
              </div>
            ))}
          </div>
        </div>
      </section>
    </NuboV12Shell>
  );
}
