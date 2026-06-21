import type { NuboTask } from "@/lib/task-types";

export async function generateResult(task: NuboTask): Promise<string> {
  return task.instruction;
}
