import { NextResponse } from "next/server";
import { createGoogleAuthUrl } from "@/lib/google-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.redirect(await createGoogleAuthUrl());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "無法啟動Google OAuth" },
      { status: 500 },
    );
  }
}
