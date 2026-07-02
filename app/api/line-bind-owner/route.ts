import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

type LineEvent = {
  source?: {
    type?: string;
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  message?: {
    type?: string;
    text?: string;
  };
};

type LineWebhookBody = {
  events?: LineEvent[];
};

function maskUserId(userId: string): string {
  if (userId.length <= 10) return userId;
  return `${userId.slice(0, 6)}...${userId.slice(-6)}`;
}

async function readJsonSafely(req: NextRequest): Promise<LineWebhookBody> {
  const rawBody = await req.text();

  if (!rawBody || !rawBody.trim()) {
    return { events: [] };
  }

  try {
    return JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return { events: [] };
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "line-bind-owner",
    message: "Owner binding route is alive.",
  });
}

export async function POST(req: NextRequest) {
  try {
    if (process.env.NUBO_BIND_OWNER_ENABLED !== "true") {
      return NextResponse.json(
        {
          ok: false,
          error: "Owner binding is disabled.",
        },
        { status: 403 }
      );
    }

    const body = await readJsonSafely(req);

    const eventWithUserId = body.events?.find((event) => event.source?.userId);
    const userId = eventWithUserId?.source?.userId;
    const text = eventWithUserId?.message?.text || "";

    if (!userId) {
      return NextResponse.json({
        ok: true,
        captured: false,
        reason: "No userId in this LINE event.",
      });
    }

    const filePath = path.join(process.cwd(), "data", "nubo-owner-line-user.json");

    const payload = {
      userId,
      maskedUserId: maskUserId(userId),
      text,
      capturedAt: new Date().toISOString(),
      note: "Copy userId into .env.local as NUBO_OWNER_LINE_USER_ID.",
    };

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");

    console.log("[line-bind-owner] captured owner userId:", maskUserId(userId));

    return NextResponse.json({
      ok: true,
      captured: true,
      maskedUserId: maskUserId(userId),
      savedTo: "data/nubo-owner-line-user.json",
    });
  } catch (error) {
    console.error("[line-bind-owner] failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
