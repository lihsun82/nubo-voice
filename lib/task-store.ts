import path from "node:path";
import { readJson } from "@/lib/json-store";
import type { NuboTask } from "@/lib/task-types";

const taskFile = path.join(process.cwd(), "data", "tasks.json");

export async function listTasks(): Promise<NuboTask[]> {
  return readJson<NuboTask[]>(taskFile, []);
}
