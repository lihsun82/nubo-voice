import { after, NextResponse } from "next/server";
import {
  getAllowedLineUserIds,
  isLineUserAllowed,
  pushLineText,
  replyLineText,
  verifyLineSignature,
} from "@/lib/line-messaging";
import { executeLineRemoteText } from "@/lib/line-remote";
import { transcribeLineAudio } from "@/lib/line-transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type LineWebhookEvent = {
  type?: string;
  webhookEventId?: string;
  replyToken?: string;
  source?: {
    type?: string;
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  message?: {
    type?: string;
    id?: string;
    text?: string;
    duration?: number;
  };
};

type LineWebhookBody = {
  destination?: string;
  events?: LineWebhookEvent[];
};

type LineWebhookCache = {
  ids: Map<string, number>;
};

const lineGlobal = globalThis as typeof globalThis & {
  __nuboLineWebhookCache?: LineWebhookCache;
};

function webhookCache() {
  if (!lineGlobal.__nuboLineWebhookCache) {
    lineGlobal.__nuboLineWebhookCache = { ids: new Map() };
  }
  return lineGlobal.__nuboLineWebhookCache;
}

function isDuplicateEvent(eventId: string | undefined) {
  if (!eventId) return false;
  const now = Date.now();
  const cache = webhookCache();
  for (const [id, timestamp] of cache.ids) {
    if (now - timestamp > 30 * 60_000) cache.ids.delete(id);
  }
  if (cache.ids.has(eventId)) return true;
  cache.ids.set(eventId, now);
  return false;
}

async function replySafely(replyToken: string | undefined, text: string) {
  if (!replyToken) return;
  try {
    await replyLineText(replyToken, text);
  } catch (error) {
    console.error("LINE reply failed", error);
  }
}

function isSupportedMessage(event: LineWebhookEvent) {
  if (event.type !== "message") return false;
  if (event.message?.type === "text") {
    return typeof event.message.text === "string";
  }
  if (event.message?.type === "audio") {
    return typeof event.message.id === "string";
  }
  return false;
}

async function executeTextCommand(
  userId: string,
  command: string,
  requestOrigin: string,
  prefix?: string,
) {
  const result = await executeLineRemoteText(command, requestOrigin);
  await pushLineText(
    userId,
    prefix ? `${prefix}\n\n${result}` : result,
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature");

  try {
    if (!verifyLineSignature(rawBody, signature)) {
      return NextResponse.json({ error: "LINE webhook簽章驗證失敗" }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "LINE webhook尚未完成設定",
      },
      { status: 503 },
    );
  }

  let payload: LineWebhookBody;
  try {
    payload = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return NextResponse.json({ error: "Webhook JSON格式錯誤" }, { status: 400 });
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  if (events.length === 0) return NextResponse.json({ ok: true });

  const allowedUsers = getAllowedLineUserIds();
  const requestOrigin = new URL(request.url).origin;

  await Promise.all(
    events.map(async (event) => {
      if (!isSupportedMessage(event)) return;
      if (isDuplicateEvent(event.webhookEventId)) return;

      const userId = event.source?.userId;
      if (event.source?.type !== "user" || !userId) {
        await replySafely(
          event.replyToken,
          "基於安全限制，NUBO LINE遠端控制只接受與官方帳號的一對一聊天室。",
        );
        return;
      }

      if (allowedUsers.length === 0) {
        await replySafely(
          event.replyToken,
          [
            "NUBO LINE遠端控制尚未綁定。",
            "",
            `你的LINE User ID：${userId}`,
            "",
            "請將這個ID填入C:\\nubo-voice\\.env.local：",
            `LINE_ALLOWED_USER_IDS=${userId}`,
            "",
            "儲存後重新啟動NUBO。綁定前不會執行任何電腦操作。",
          ].join("\n"),
        );
        return;
      }

      if (!isLineUserAllowed(userId)) {
        await replySafely(event.replyToken, "此LINE帳號沒有NUBO遠端控制權限。");
        return;
      }

      if (event.message?.type === "audio") {
        const messageId = event.message.id;
        const duration = event.message.duration ?? 0;
        if (!messageId) return;

        if (duration > 180_000) {
          await replySafely(
            event.replyToken,
            "語音指令目前限制3分鐘內，請縮短後重新傳送。",
          );
          return;
        }

        await replySafely(
          event.replyToken,
          "NUBO已收到LINE語音，正在轉成文字並於家中電腦執行，完成後會回報。",
        );

        after(async () => {
          try {
            const transcription = await transcribeLineAudio(messageId);
            const recognized = transcription.text;
            await executeTextCommand(
              userId,
              recognized,
              requestOrigin,
              `語音辨識：${recognized}`,
            );
          } catch (error) {
            console.error("LINE voice execution failed", error);
            try {
              await pushLineText(
                userId,
                `NUBO語音指令失敗：${error instanceof Error ? error.message : "未知錯誤"}`,
              );
            } catch (pushError) {
              console.error("LINE voice failure notification failed", pushError);
            }
          }
        });
        return;
      }

      const command = event.message?.text?.trim();
      if (!command) return;

      await replySafely(
        event.replyToken,
        `NUBO已收到遠端指令：${command.slice(0, 100)}\n正在家中電腦執行，完成後會回報。`,
      );

      after(async () => {
        try {
          await executeTextCommand(userId, command, requestOrigin);
        } catch (error) {
          console.error("LINE remote execution failed", error);
          try {
            await pushLineText(
              userId,
              `NUBO遠端執行失敗：${error instanceof Error ? error.message : "未知錯誤"}`,
            );
          } catch (pushError) {
            console.error("LINE failure notification failed", pushError);
          }
        }
      });
    }),
  );

  return NextResponse.json({ ok: true });
}
