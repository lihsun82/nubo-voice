import path from "node:path";
import { readJson, writeJson } from "@/lib/json-store";
import type { NuboTask } from "@/lib/task-types";

const taskFile = path.join(process.cwd(), "data", "tasks.json");

export async function listTasks(): Promise<NuboTask[]> {
  return readJson<NuboTask[]>(taskFile, []);
}

export async function getTask(id: string): Promise<NuboTask | null> {
  return (await listTasks()).find((task) => task.id === id) ?? null;
}

export async function updateTask(
  id: string,
  changes: Partial<NuboTask>,
): Promise<NuboTask | null> {
  const tasks = await listTasks();
  const index = tasks.findIndex((task) => task.id === id);
  if (index < 0) return null;
  tasks[index] = {
    ...tasks[index],
    ...changes,
    id: tasks[index].id,
    updatedAt: new Date().toISOString(),
  };
  await writeJson(taskFile, tasks);
  return tasks[index];
}
