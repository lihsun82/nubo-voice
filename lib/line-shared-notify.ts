import fs from "node:fs/promises";
import path from "node:path";

type LineRecipientConfig = {
  enabled: boolean;
  defaultMode: "multicast" | "broadcast" | "group";
  allowBroadcast: boolean;
  users: Array<{
    name: string;
    userId: string;
    role?: string;
    notify: boolean;
  }>;
  groups: Array<{
    name: string;
    groupId: string;
    notify: boolean;
  }>;
};

type SharedNotifyInput = {
  mode?: "multicast" | "broadcast" | "group";
  title?: string;
  text: string;
  source?: string;
};

const LINE_API_BASE = "https://api.line.me/v2/bot/message";

function limitText(value: string, max: number) {
  return value.trim().slice(0, max);
}

async function loadRecipients(): Promise<LineRecipientConfig> {
  const file = path.join(process.cwd(), "data", "line-recipients.json");
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as LineRecipientConfig;
}

function getAccessToken() {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("缺少 LINE_CHANNEL_ACCESS_TOKEN");
  return token;
}

function buildTextMessage(input: SharedNotifyInput) {
  const title = input.title ? limitText(input.title, 80) : "NUBO 通知";
  const text = limitText(input.text, 500);
  return {
    type: "text",
    text: `${title}\n${text}`,
  };
}

async function callLineApi(endpoint: string, body: unknown) {
  const response = await fetch(`${LINE_API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API 失敗 ${response.status}: ${errorText}`);
  }

  return true;
}

export async function sendLineSharedNotification(input: SharedNotifyInput) {
  const config = await loadRecipients();

  if (!config.enabled) {
    return {
      ok: false,
      mode: input.mode ?? config.defaultMode,
      sent: 0,
      failed: 0,
      message: "LINE 共同通知目前 disabled",
    };
  }

  const mode = input.mode ?? config.defaultMode;
  const message = buildTextMessage(input);

  if (mode === "broadcast") {
    if (!config.allowBroadcast) {
      return {
        ok: false,
        mode,
        sent: 0,
        failed: 0,
        message: "broadcast 已被設定檔禁止",
      };
    }

    await callLineApi("/broadcast", {
      messages: [message],
    });

    return {
      ok: true,
      mode,
      sent: -1,
      failed: 0,
      message: "已送出 broadcast；實際人數由 LINE 官方帳號好友數決定",
    };
  }

  if (mode === "group") {
    const groups = config.groups.filter((group) => group.notify && group.groupId);

    for (const group of groups) {
      await callLineApi("/push", {
        to: group.groupId,
        messages: [message],
      });
    }

    return {
      ok: true,
      mode,
      sent: groups.length,
      failed: 0,
      message: `已推送到 ${groups.length} 個群組`,
    };
  }

  const userIds = config.users
    .filter((user) => user.notify && user.userId.startsWith("U"))
    .map((user) => user.userId);

  if (userIds.length === 0) {
    return {
      ok: false,
      mode,
      sent: 0,
      failed: 0,
      message: "沒有可發送的 notify=true userId",
    };
  }

  await callLineApi("/multicast", {
    to: userIds,
    messages: [message],
  });

  return {
    ok: true,
    mode,
    sent: userIds.length,
    failed: 0,
    message: `已推送給 ${userIds.length} 位用戶`,
  };
}