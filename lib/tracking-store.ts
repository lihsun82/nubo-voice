import { promises as fs } from "node:fs";
import path from "node:path";

export type TrackingRequest = {
  id: string;
  title: string;
  target: string;
  frequency: "hourly" | "daily" | "custom";
  customSchedule: string | null;
  notifyWhen: string;
  status: "draft";
  createdAt: string;
};

const storePath = path.join(process.cwd(), "data", "tracking-requests.json");

export async function saveTrackingRequest(
  input: Omit<TrackingRequest, "id" | "status" | "createdAt">,
): Promise<TrackingRequest> {
  const request: TrackingRequest = {
    ...input,
    id: crypto.randomUUID(),
    status: "draft",
    createdAt: new Date().toISOString(),
  };

  await fs.mkdir(path.dirname(storePath), { recursive: true });

  let current: TrackingRequest[] = [];
  try {
    current = JSON.parse(await fs.readFile(storePath, "utf8")) as TrackingRequest[];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw error;
  }

  current.push(request);
  await fs.writeFile(storePath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  return request;
}
