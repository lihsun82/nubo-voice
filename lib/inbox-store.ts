import path from "node:path";
import { readJson } from "@/lib/json-store";
import type { NuboNotice } from "@/lib/task-types";

const inboxFile = path.join(process.cwd(), "data", "inbox.json");

export async function listInbox(limit = 30): Promise<NuboNotice[]> {
  const items = await readJson<NuboNotice[]>(inboxFile, []);
  return items.slice(-limit).reverse();
}
