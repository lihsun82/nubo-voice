import { getTask } from "@/lib/task-store";

export async function runTask(id: string) {
  const task = await getTask(id);
  if (!task) throw new Error("找不到指定任務");
  return task;
}
