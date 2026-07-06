import { NextResponse } from "next/server";
import { z } from "zod";
import {
  buildTaskInputFromPlan,
  createOrchestratorPlan,
} from "@/lib/task-orchestrator";
import { createTask } from "@/lib/task-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  instruction: z.string().min(2).max(6000),
  title: z.string().min(2).max(100).optional(),
  createTask: z.boolean().default(false),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "任務指揮資料格式不完整", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const plan = createOrchestratorPlan(parsed.data);

  if (!parsed.data.createTask) {
    return NextResponse.json({ ok: true, plan, task: null });
  }

  if (!plan.canAutoCreateTask) {
    return NextResponse.json({
      ok: true,
      plan,
      task: null,
      blocked: true,
      reason: "此任務屬 L3/L4，需要人工確認後才可建立可執行任務。",
    });
  }

  const task = await createTask(buildTaskInputFromPlan(plan));
  return NextResponse.json({ ok: true, plan, task });
}
