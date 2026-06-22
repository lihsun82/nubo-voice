import { NextResponse } from "next/server";
import open from "open";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (process.platform !== "win32") {
    return NextResponse.json(
      { error: "LINE應用程式啟動目前只支援Windows" },
      { status: 400 },
    );
  }

  try {
    await open("line://", { wait: false });
    return NextResponse.json({ ok: true, opened: true, app: "LINE" });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "無法啟動LINE，請確認電腦已安裝LINE桌面版",
      },
      { status: 500 },
    );
  }
}
