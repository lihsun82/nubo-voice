import { NextResponse } from "next/server";
import { z } from "zod";
import {
  executeApprovedAgent,
  listAgentExecutions,
} from "@/lib/approved-agent-execution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  approvalId: z.string().min(1),
});

export async function GET() {
  return NextResponse.json({ ok: true, executions: await listAgentExecutions() });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "代理人執行資料格式不完整", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const execution = await executeApprovedAgent(parsed.data.approvalId);
  return NextResponse.json({ ok: true, execution });
}
