import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const storePath = path.join(process.cwd(), "lib", "v12", "v12-store.json");

export type V12LogStatus = "success" | "warning" | "error" | "pending";

export type V12Log = {
  id: string;
  time: string;
  source: string;
  action: string;
  status: V12LogStatus;
  detail: string;
};

export type V12Notification = {
  id: string;
  time: string;
  level: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
};

type V12Store = {
  logs: V12Log[];
  notifications: V12Notification[];
};

function defaultStore(): V12Store {
  return {
    logs: [],
    notifications: [],
  };
}

function ensureStoreFile() {
  const dir = path.dirname(storePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(defaultStore(), null, 2), "utf8");
  }
}

export function readV12Store(): V12Store {
  try {
    ensureStoreFile();

    const raw = fs.readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw || "{}");

    return {
      logs: Array.isArray(parsed.logs) ? parsed.logs : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
    };
  } catch {
    const safe = defaultStore();
    fs.writeFileSync(storePath, JSON.stringify(safe, null, 2), "utf8");
    return safe;
  }
}

export function writeV12Store(data: V12Store) {
  ensureStoreFile();

  const safe: V12Store = {
    logs: Array.isArray(data.logs) ? data.logs : [],
    notifications: Array.isArray(data.notifications) ? data.notifications : [],
  };

  fs.writeFileSync(storePath, JSON.stringify(safe, null, 2), "utf8");
}

export function addV12Log(input: Omit<V12Log, "id" | "time">) {
  const store = readV12Store();

  const log: V12Log = {
    id: `log_${Date.now()}`,
    time: new Date().toLocaleString("zh-TW", { hour12: false }),
    source: input.source,
    action: input.action,
    status: input.status,
    detail: input.detail,
  };

  writeV12Store({
    ...store,
    logs: [log, ...store.logs].slice(0, 100),
  });

  return log;
}

export function addV12Notification(input: Omit<V12Notification, "id" | "time">) {
  const store = readV12Store();

  const notification: V12Notification = {
    id: `noti_${Date.now()}`,
    time: new Date().toLocaleString("zh-TW", { hour12: false }),
    level: input.level,
    title: input.title,
    message: input.message,
  };

  writeV12Store({
    ...store,
    notifications: [notification, ...store.notifications].slice(0, 100),
  });

  return notification;
}
