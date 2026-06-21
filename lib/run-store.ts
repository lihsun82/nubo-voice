import path from "node:path";
import { readJson, writeJson } from "@/lib/json-store";
import type { TaskRun } from "@/lib/task-types";

const runFile = path.join(process.cwd(), "data", "runs.json");

export async function listRuns(limit = 30): Promise<TaskRun[]> {
  const runs = await readJson<TaskRun[]>(runFile, []);
  return runs.slice(-limit).reverse();
}

export async function saveRun(run: TaskRun): Promise<void> {
  const runs = await readJson<TaskRun[]>(runFile, []);
  const index = runs.findIndex((item) => item.id === run.id);
  if (index >= 0) runs[index] = run;
  else runs.push(run);
  await writeJson(runFile, runs.slice(-300));
}
