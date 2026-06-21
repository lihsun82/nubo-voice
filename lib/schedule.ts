import type { TaskSchedule } from "@/lib/task-types";

export function calculateNextRun(schedule: TaskSchedule): string | null {
  return schedule.runAt ?? null;
}
