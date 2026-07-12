import fs from "node:fs/promises";
import path from "node:path";

export type LineUserRecord = {
  userId: string;
  type: "user" | "group" | "room" | "unknown";
  groupId?: string;
  roomId?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  messageCount: number;
};

type LineSourceLike = {
  type?: string;
  userId?: string;
  groupId?: string;
  roomId?: string;
};

const USERS_FILE = path.join(process.cwd(), "data", "line-users.json");

async function ensureDataDir() {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
}

async function readUsers(): Promise<LineUserRecord[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LineUserRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeUsers(users: LineUserRecord[]) {
  await ensureDataDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

export async function recordLineUserFromSource(source: LineSourceLike | undefined) {
  if (!source?.userId || !source.userId.startsWith("U")) {
    return {
      recorded: false,
      reason: "No valid source.userId",
    };
  }

  const now = new Date().toISOString();
  const users = await readUsers();
  const existing = users.find((item) => item.userId === source.userId);

  if (existing) {
    existing.lastSeenAt = now;
    existing.messageCount = (existing.messageCount || 0) + 1;

    if (source.type === "group" && source.groupId) existing.groupId = source.groupId;
    if (source.type === "room" && source.roomId) existing.roomId = source.roomId;

    await writeUsers(users);

    return {
      recorded: true,
      created: false,
      userId: source.userId,
    };
  }

  users.push({
    userId: source.userId,
    type:
      source.type === "user" || source.type === "group" || source.type === "room"
        ? source.type
        : "unknown",
    groupId: source.groupId,
    roomId: source.roomId,
    firstSeenAt: now,
    lastSeenAt: now,
    messageCount: 1,
  });

  await writeUsers(users);

  return {
    recorded: true,
    created: true,
    userId: source.userId,
  };
}