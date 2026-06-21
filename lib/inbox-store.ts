import path from "node:path";
import { readJson, writeJson } from "@/lib/json-store";
import type { NuboNotice } from "@/lib/task-types";

const inboxFile = path.join(process.cwd(), "data", "inbox.json");

export async function listInbox(limit = 30): Promise<NuboNotice[]> {
  const items = await readJson<NuboNotice[]>(inboxFile, []);
  return items.slice(-limit).reverse();
}

export async function addInboxItem(
  taskId: string,
  title: string,
  message: string,
): Promise<NuboNotice> {
  const item: NuboNotice = {
    id: crypto.randomUUID(),
    taskId,
    title,
    message,
    createdAt: new Date().toISOString(),
    read: false,
  };
  const items = await readJson<NuboNotice[]>(inboxFile, []);
  items.push(item);
  await writeJson(inboxFile, items.slice(-300));
  return item;
}

export async function markInboxRead(id: string): Promise<boolean> {
  const items = await readJson<NuboNotice[]>(inboxFile, []);
  const item = items.find((entry) => entry.id === id);
  if (!item) return false;
  item.read = true;
  await writeJson(inboxFile, items);
  return true;
}
