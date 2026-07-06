import { NextResponse } from "next/server";
import { z } from "zod";
import { decideAgentApproval } from "@/lib/agent-approval-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const schema = z.object({
  decision: z.enum(["approved", "rejected"]),
  approvalNote: z.string().max(1000).optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "審核資料格式不完整", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const approval = await decideAgentApproval(
    id,
    parsed.data.decision,
    parsed.data.approvalNote,
  );
  if (!approval) return NextResponse.json({ error: "找不到授權請求" }, { status: 404 });
  return NextResponse.json({ ok: true, approval });
}
