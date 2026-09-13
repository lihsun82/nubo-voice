import path from "node:path";
import { readJson, writeJson } from "@/lib/json-store";

export type AgentWorkRunStatus =
  | "running"
  | "planned"
  | "success"
  | "failed";

export type AgentWorkRun = {
  id: string;
  title: string;
  instruction: string;
  mode: "plan" | "execute";
  requireComplete: boolean;
  status: AgentWorkRunStatus;
  createdAt: string;
  finishedAt: string | null;
  result: unknown | null;
  error: string | null;
};

const agentRunFile = path.join(
  process.cwd(),
  "data",
  "agent-work-runs.json",
);

export async function listAgentWorkRuns(
  limit = 20,
): Promise<AgentWorkRun[]> {
  const runs = await readJson<AgentWorkRun[]>(
    agentRunFile,
    [],
  );
  return runs.slice(-limit).reverse();
}

export async function getAgentWorkRun(
  id: string,
): Promise<AgentWorkRun | null> {
  const runs = await readJson<AgentWorkRun[]>(
    agentRunFile,
    [],
  );
  return runs.find((run) => run.id === id) ?? null;
}

export async function saveAgentWorkRun(
  run: AgentWorkRun,
): Promise<void> {
  const runs = await readJson<AgentWorkRun[]>(
    agentRunFile,
    [],
  );
  const index = runs.findIndex(
    (item) => item.id === run.id,
  );

  if (index >= 0) runs[index] = run;
  else runs.push(run);

  await writeJson(
    agentRunFile,
    runs.slice(-200),
  );
}
