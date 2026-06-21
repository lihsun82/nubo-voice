import { NextResponse } from "next/server";
import { z } from "zod";
import { listInbox } from "@/lib/inbox-store";
import { listRuns } from "@/lib/run-store";
import { createTask, listTasks } from "@/lib/task-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scheduleSchema = z.object({
  type: z.enum(["once", "hourly", "daily", "interval"]),
  runAt: z.string().datetime().optional(),
  hour: z.number().int().min(0).max(23).optional(),
  minute: z.number().int().min(0).max(59).optional(),
  intervalMinutes: z.number().int().min(5).max(10080).optional(),
  timezone: z.literal("Asia/Taipei").default("Asia/Taipei"),
});

const taskSchema = z.object({
  title: z.string().min(2).max(100),
  kind: z.enum(["reminder", "report", "research", "brief"]),
  instruction: z.string().min(2).max(4000),
  condition: z.string().max(1000).optional(),
  schedule: scheduleSchema,
});

export async function GET() {
  const [tasks, runs, inbox] = await Promise.all([
    listTasks(),
    listRuns(),
    listInbox(),
  ]);
  return NextResponse.json({ tasks, runs, inbox });
}

export async function POST(request: Request) {
  const parsed = taskSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "任務資料格式不完整", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const task = await createTask(parsed.data);
  return NextResponse.json({ ok: true, task });
}
