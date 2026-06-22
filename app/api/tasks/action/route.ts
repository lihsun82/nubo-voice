import { NextResponse } from "next/server";
import { z } from "zod";
import { markInboxRead } from "@/lib/inbox-store";
import { saveRun } from "@/lib/run-store";
import { calculateNextRun } from "@/lib/schedule";
import { getTask, updateTask } from "@/lib/task-store";
import { deliverTaskOutput, generateTaskOutput } from "@/lib/task-workflow";
import type { TaskRun } from "@/lib/task-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["run", "pause", "resume", "read"]),
  id: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "操作資料不完整" }, { status: 400 });
  }

  const { action, id } = parsed.data;
  if (action === "read") {
    return NextResponse.json({ ok: await markInboxRead(id) });
  }

  const task = await getTask(id);
  if (!task) return NextResponse.json({ error: "找不到任務" }, { status: 404 });

  if (action === "pause" || action === "resume") {
    const updated = await updateTask(id, {
      status: action === "pause" ? "paused" : "active",
      nextRunAt:
        action === "resume" ? calculateNextRun(task.schedule, new Date()) : task.nextRunAt,
    });
    return NextResponse.json({ ok: true, task: updated });
  }

  const run: TaskRun = {
    id: crypto.randomUUID(),
    taskId: id,
    status: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    output: null,
    error: null,
  };
  await saveRun(run);

  try {
    const output = await generateTaskOutput(task);
    const matched =
      task.kind !== "research" ||
      output.trimStart().toUpperCase().startsWith("CONDITION: MATCH");
    const delivery = matched ? await deliverTaskOutput(task, output) : null;

    const finished = new Date();
    run.status = "success";
    run.finishedAt = finished.toISOString();
    run.output = delivery ? `${output}\n\n交付結果：${delivery.note}` : output;
    await saveRun(run);

    const oneTime = task.schedule.type === "once";
    await updateTask(id, {
      status: oneTime ? "completed" : "active",
      lastRunAt: finished.toISOString(),
      lastResult: run.output,
      lastError: null,
      nextRunAt: oneTime ? null : calculateNextRun(task.schedule, finished),
    });

    return NextResponse.json({ ok: true, run, matched, delivery });
  } catch (error) {
    const message = error instanceof Error ? error.message : "任務處理失敗";
    run.status = "failed";
    run.finishedAt = new Date().toISOString();
    run.error = message;
    await saveRun(run);
    await updateTask(id, { lastError: message, lastRunAt: run.finishedAt });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
