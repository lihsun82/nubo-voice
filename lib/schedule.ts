import type { TaskSchedule } from "@/lib/task-types";

export function calculateNextRun(
  schedule: TaskSchedule,
  from = new Date(),
): string | null {
  if (schedule.type === "once") {
    if (!schedule.runAt) return null;
    const target = new Date(schedule.runAt);
    return Number.isNaN(target.getTime()) ? null : target.toISOString();
  }

  const futureStart = schedule.runAt ? new Date(schedule.runAt) : null;
  if (futureStart && !Number.isNaN(futureStart.getTime()) && futureStart > from) {
    return futureStart.toISOString();
  }

  const minutes =
    schedule.type === "hourly"
      ? 60
      : schedule.type === "daily"
        ? 1440
        : Math.max(5, schedule.intervalMinutes ?? 60);

  return new Date(from.getTime() + minutes * 60_000).toISOString();
}
