import { NextResponse } from "next/server";
import { z } from "zod";
import { addInboxItem, markInboxRead } from "@/lib/inbox-store";
import { generateResult } from "@/lib/report-generator";
import { saveRun } from "@/lib/run-store";
import { calculateNextRun } from "@/lib/schedule";
import { getTask, updateTask } from "@/lib/task-store";
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
    const output =
      task.kind === "reminder"
        ? task.instruction
        : await generateResult(task);
    const finished = new Date();
    run.status = "success";
    run.finishedAt = finished.toISOString();
    run.output = output;
    await saveRun(run);

    const oneTime = task.schedule.type === "once";
    await updateTask(id, {
      status: oneTime ? "completed" : "active",
      lastRunAt: finished.toISOString(),
      lastResult: output,
      lastError: null,
      nextRunAt: oneTime ? null : calculateNextRun(task.schedule, finished),
    });

    const matched =
      task.kind !== "research" ||
      output.trimStart().toUpperCase().startsWith("CONDITION: MATCH");
    if (matched) await addInboxItem(id, task.title, output);

    return NextResponse.json({ ok: true, run, matched });
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
