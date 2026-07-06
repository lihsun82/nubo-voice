import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createAgentApproval,
  listAgentApprovals,
} from "@/lib/agent-approval-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handoffSchema = z.object({
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  kind: z.string().min(1),
  status: z.string().min(1),
  matchedCapabilities: z.array(z.string()).default([]),
  reason: z.string().min(1),
  requiresApproval: z.boolean(),
  riskLevel: z.enum(["L1", "L2", "L3", "L4"]),
  allowedOutputs: z.array(z.string()).default([]),
  forbiddenActions: z.array(z.string()).default([]),
});

const schema = z.object({
  taskTitle: z.string().min(1).max(200),
  instruction: z.string().min(2).max(8000),
  riskLevel: z.enum(["L1", "L2", "L3", "L4"]),
  handoff: handoffSchema,
  requestedScope: z.array(z.string()).max(20).optional(),
});

export async function GET() {
  return NextResponse.json({ ok: true, approvals: await listAgentApprovals() });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "授權請求資料格式不完整", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const approval = await createAgentApproval(parsed.data);
  return NextResponse.json({ ok: true, approval });
}
