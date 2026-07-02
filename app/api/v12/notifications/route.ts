import { NextRequest, NextResponse } from "next/server";
import { addV12Notification, readV12Store } from "@/lib/v12/v12-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const store = readV12Store();

    return NextResponse.json({
      ok: true,
      notifications: store.notifications || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "V12_NOTIFICATIONS_GET_FAILED",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const notification = addV12Notification({
      level: body.level || "info",
      title: body.title || "NUBO Notification",
      message: body.message || "",
    });

    return NextResponse.json({
      ok: true,
      notification,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "V12_NOTIFICATIONS_POST_FAILED",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
