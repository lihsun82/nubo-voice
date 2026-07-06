import path from "node:path";
import { createArtifacts, artifactLinks } from "@/lib/artifact-store";
import {
  getAgentApproval,
  type AgentApprovalRequest,
} from "@/lib/agent-approval-store";
import { addInboxItem } from "@/lib/inbox-store";
import { readJson, writeJson } from "@/lib/json-store";
import type { NuboTask } from "@/lib/task-types";

export type AgentExecutionMode = "live" | "dry_run";
export type AgentExecutionStatus = "success" | "blocked" | "failed";

export type ApprovedAgentExecution = {
  id: string;
  approvalId: string;
  agentId: string;
  agentName: string;
  mode: AgentExecutionMode;
  status: AgentExecutionStatus;
  taskTitle: string;
  riskLevel: AgentApprovalRequest["riskLevel"];
  output: string;
  artifactIds: string[];
  blockedReason: string | null;
  createdAt: string;
};

const executionFile = path.join(process.cwd(), "data", "agent-executions.json");

function makeVirtualTask(approval: AgentApprovalRequest): NuboTask {
  return {
    id: approval.id,
    title: approval.taskTitle,
    kind: "report",
    instruction: approval.instruction,
    status: "active",
    schedule: {
      type: "once",
      runAt: new Date().toISOString(),
      timezone: "Asia/Taipei",
    },
    delivery: { type: "inbox" },
    createdAt: approval.createdAt,
    updatedAt: new Date().toISOString(),
    nextRunAt: null,
    lastRunAt: null,
  };
}

function isLiveAllowed(approval: AgentApprovalRequest) {
  return (
    approval.status === "approved" &&
    approval.handoff.status === "available" &&
    approval.handoff.agentId === "document-artifact-adapter" &&
    (approval.riskLevel === "L1" || approval.riskLevel === "L2")
  );
}

function renderDryRunOutput(approval: AgentApprovalRequest) {
  return [
    `# ${approval.taskTitle}`,
    "",
    "## 外部代理人受控執行結果",
    "",
    `代理人：${approval.handoff.agentName}`,
    `狀態：${approval.handoff.status}`,
    `風險等級：${approval.riskLevel}`,
    "執行模式：DRY RUN",
    "",
    "此代理人尚未進入 live 執行，原因可能是 needs_config、planned、disabled，或任務風險超出自動執行範圍。",
    "",
    "## 已核准範圍",
    approval.requestedScope.map((item) => `- ${item}`).join("\n"),
    "",
    "## 禁止動作",
    approval.handoff.forbiddenActions.map((item) => `- ${item}`).join("\n"),
    "",
    "## 下一步",
    "1. 補齊該 Adapter 需要的設定。",
    "2. 確認任務仍維持 L1/L2。",
    "3. 再由 NUBO 執行 live adapter。",
  ].join("\n");
}

function renderDocumentArtifactOutput(approval: AgentApprovalRequest) {
  return [
    `# ${approval.taskTitle}`,
    "",
    "## Document Artifact Adapter 執行結果",
    "",
    "此授權請求已核准，且代理人為可 live 執行的低風險 Document Artifact Adapter。",
    "",
    "## 原始任務",
    approval.instruction,
    "",
    "## 授權範圍",
    approval.requestedScope.map((item) => `- ${item}`).join("\n"),
    "",
    "## 禁止動作",
    approval.handoff.forbiddenActions.map((item) => `- ${item}`).join("\n"),
    "",
    "## 執行結論",
    "已在本機建立 Markdown / HTML / JSON 交付檔案。HTML 可用瀏覽器開啟後列印成 PDF。",
  ].join("\n");
}

async function saveExecution(record: ApprovedAgentExecution) {
  const records = await readJson<ApprovedAgentExecution[]>(executionFile, []);
  await writeJson(executionFile, [...records, record].slice(-500));
}

export async function listAgentExecutions(limit = 80): Promise<ApprovedAgentExecution[]> {
  const records = await readJson<ApprovedAgentExecution[]>(executionFile, []);
  return records.slice(-limit).reverse();
}

export async function executeApprovedAgent(approvalId: string): Promise<ApprovedAgentExecution> {
  const approval = await getAgentApproval(approvalId);
  const now = new Date().toISOString();

  if (!approval) {
    const record: ApprovedAgentExecution = {
      id: crypto.randomUUID(),
      approvalId,
      agentId: "unknown",
      agentName: "Unknown Agent",
      mode: "dry_run",
      status: "failed",
      taskTitle: "Unknown Task",
      riskLevel: "L4",
      output: "找不到授權請求，無法執行。",
      artifactIds: [],
      blockedReason: "找不到授權請求",
      createdAt: now,
    };
    await saveExecution(record);
    return record;
  }

  if (approval.status !== "approved") {
    const output = `授權狀態為 ${approval.status}，不是 approved，已阻止執行。`;
    const record: ApprovedAgentExecution = {
      id: crypto.randomUUID(),
      approvalId,
      agentId: approval.handoff.agentId,
      agentName: approval.handoff.agentName,
      mode: "dry_run",
      status: "blocked",
      taskTitle: approval.taskTitle,
      riskLevel: approval.riskLevel,
      output,
      artifactIds: [],
      blockedReason: output,
      createdAt: now,
    };
    await saveExecution(record);
    await addInboxItem(approval.id, `代理人執行已阻止：${approval.handoff.agentName}`, output);
    return record;
  }

  const live = isLiveAllowed(approval);
  const output = live ? renderDocumentArtifactOutput(approval) : renderDryRunOutput(approval);
  const task = makeVirtualTask(approval);
  const artifacts = live ? await createArtifacts(task, output) : [];
  const links = artifactLinks(artifacts);
  const outputWithLinks = links ? `${output}\n\n---\n檔案下載：\n${links}` : output;

  const record: ApprovedAgentExecution = {
    id: crypto.randomUUID(),
    approvalId,
    agentId: approval.handoff.agentId,
    agentName: approval.handoff.agentName,
    mode: live ? "live" : "dry_run",
    status: live ? "success" : "blocked",
    taskTitle: approval.taskTitle,
    riskLevel: approval.riskLevel,
    output: outputWithLinks,
    artifactIds: artifacts.map((artifact) => artifact.id),
    blockedReason: live ? null : "代理人不是 available Document Artifact Adapter，或任務風險超出 L1/L2。",
    createdAt: now,
  };

  await saveExecution(record);
  await addInboxItem(
    approval.id,
    `代理人執行：${approval.handoff.agentName}`,
    `${outputWithLinks}\n\n---\n執行模式：${record.mode}\n執行狀態：${record.status}`,
  );
  return record;
}
