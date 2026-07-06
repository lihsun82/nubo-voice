import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listExternalAgents,
  recommendExternalAgentHandoffs,
} from "@/lib/external-agent-gateway";
import type { AgentRole, RiskLevel } from "@/lib/task-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const agentRoleSchema = z.enum([
  "planner",
  "research",
  "data",
  "report",
  "mail",
  "coding",
  "qa",
  "device",
]);

const schema = z.object({
  instruction: z.string().min(2).max(6000),
  internalAgents: z.array(agentRoleSchema).default([]),
  riskLevel: z.enum(["L1", "L2", "L3", "L4"]).default("L2"),
});

export async function GET() {
  return NextResponse.json({ ok: true, agents: listExternalAgents() });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "外部代理人分析資料格式不完整", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const handoffs = recommendExternalAgentHandoffs(
    parsed.data.instruction,
    parsed.data.internalAgents as AgentRole[],
    parsed.data.riskLevel as RiskLevel,
  );

  return NextResponse.json({
    ok: true,
    handoffs,
    policy: {
      mode: "allowlist_only",
      highRisk: "manual_confirmation_required",
    },
  });
}
