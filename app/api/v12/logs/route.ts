import { NextRequest, NextResponse } from "next/server";
import { addV12Log, readV12Store } from "@/lib/v12/v12-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const store = readV12Store();

    return NextResponse.json({
      ok: true,
      logs: store.logs || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "V12_LOGS_GET_FAILED",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const log = addV12Log({
      source: body.source || "NUBO",
      action: body.action || "unknown",
      status: body.status || "pending",
      detail: body.detail || "",
    });

    return NextResponse.json({
      ok: true,
      log,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "V12_LOGS_POST_FAILED",
        message: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
