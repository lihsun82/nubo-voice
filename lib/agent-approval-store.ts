import path from "node:path";
import { readJson, writeJson } from "@/lib/json-store";
import type { ExternalAgentHandoff } from "@/lib/external-agent-gateway";
import type { RiskLevel } from "@/lib/task-orchestrator";

export type AgentApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type AgentApprovalRequest = {
  id: string;
  taskTitle: string;
  instruction: string;
  riskLevel: RiskLevel;
  handoff: ExternalAgentHandoff;
  requestedScope: string[];
  approvalNote: string | null;
  status: AgentApprovalStatus;
  createdAt: string;
  updatedAt: string;
  decidedAt: string | null;
  expiresAt: string;
};

export type CreateAgentApprovalInput = {
  taskTitle: string;
  instruction: string;
  riskLevel: RiskLevel;
  handoff: ExternalAgentHandoff;
  requestedScope?: string[];
};

const approvalFile = path.join(process.cwd(), "data", "agent-approvals.json");
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function isExpired(request: AgentApprovalRequest, now = new Date()) {
  return request.status === "pending" && new Date(request.expiresAt).getTime() <= now.getTime();
}

function normalizeRequests(requests: AgentApprovalRequest[]) {
  const now = new Date();
  let changed = false;
  const normalized = requests.map((request) => {
    if (!isExpired(request, now)) return request;
    changed = true;
    return {
      ...request,
      status: "expired" as const,
      updatedAt: now.toISOString(),
    };
  });
  return { requests: normalized, changed };
}

export async function listAgentApprovals(limit = 80): Promise<AgentApprovalRequest[]> {
  const stored = await readJson<AgentApprovalRequest[]>(approvalFile, []);
  const normalized = normalizeRequests(stored);
  if (normalized.changed) await writeJson(approvalFile, normalized.requests);
  return normalized.requests.slice(-limit).reverse();
}

export async function getAgentApproval(id: string): Promise<AgentApprovalRequest | null> {
  return (await listAgentApprovals(500)).find((request) => request.id === id) ?? null;
}

export async function createAgentApproval(input: CreateAgentApprovalInput) {
  const now = new Date();
  const request: AgentApprovalRequest = {
    id: crypto.randomUUID(),
    taskTitle: input.taskTitle,
    instruction: input.instruction,
    riskLevel: input.riskLevel,
    handoff: input.handoff,
    requestedScope: input.requestedScope?.length
      ? input.requestedScope
      : input.handoff.allowedOutputs,
    approvalNote: null,
    status: "pending",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    decidedAt: null,
    expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS).toISOString(),
  };
  const requests = await readJson<AgentApprovalRequest[]>(approvalFile, []);
  await writeJson(approvalFile, [...requests, request].slice(-500));
  return request;
}

export async function decideAgentApproval(
  id: string,
  decision: "approved" | "rejected",
  approvalNote?: string,
): Promise<AgentApprovalRequest | null> {
  const stored = await readJson<AgentApprovalRequest[]>(approvalFile, []);
  const normalized = normalizeRequests(stored);
  const index = normalized.requests.findIndex((request) => request.id === id);
  if (index < 0) return null;
  const request = normalized.requests[index];
  if (request.status !== "pending") return request;

  const now = new Date().toISOString();
  normalized.requests[index] = {
    ...request,
    status: decision,
    approvalNote: approvalNote?.trim() || null,
    decidedAt: now,
    updatedAt: now,
  };
  await writeJson(approvalFile, normalized.requests);
  return normalized.requests[index];
}

export function approvalDecisionSummary(request: AgentApprovalRequest) {
  return [
    `授權請求：${request.taskTitle}`,
    `狀態：${request.status}`,
    `代理人：${request.handoff.agentName}`,
    `風險等級：${request.riskLevel}`,
    `授權範圍：${request.requestedScope.join("、")}`,
    `禁止動作：${request.handoff.forbiddenActions.join("、")}`,
    request.approvalNote ? `審核備註：${request.approvalNote}` : "審核備註：無",
  ].join("\n");
}
