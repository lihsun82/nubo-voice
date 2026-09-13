type LineTextMessage = {
  type: "text";
  text: string;
};

type LinePushBody = {
  to: string;
  messages: LineTextMessage[];
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

export async function pushLineTextMessage(text: string): Promise<void> {
  const channelAccessToken = getRequiredEnv("LINE_CHANNEL_ACCESS_TOKEN");
  const to = getRequiredEnv("NUBO_OWNER_LINE_USER_ID");

  const body: LinePushBody = {
    to,
    messages: [
      {
        type: "text",
        text,
      },
    ],
  };

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LINE push failed: ${res.status} ${detail}`);
  }
}

export function buildNameCalledMessage(keyword: string, transcript?: string): string {
  const now = new Date();

  const timeText = now.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });

  const cleanTranscript = transcript?.trim();

  return [
    "🔔 AINUBO 提醒",
    "",
    `剛剛有人叫你：${keyword}`,
    `時間：${timeText}`,
    "來源：AINUBO 桌機麥克風",
    cleanTranscript ? `內容：${cleanTranscript}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}