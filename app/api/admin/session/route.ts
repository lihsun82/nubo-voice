import { NextRequest, NextResponse } from "next/server";
import {
  clearAdminSession,
  getAdminSession,
  isSameOriginAdminWrite,
  setAdminSession,
  verifyGoogleAdminCredential,
} from "@/lib/nubo-admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  return NextResponse.json({
    authenticated: Boolean(session),
    email: session?.email || null,
    clientId: process.env.GOOGLE_CLIENT_ID || null,
    configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.NUBO_ADMIN_GOOGLE_EMAIL),
  }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginAdminWrite(request)) {
    return NextResponse.json({ error: "登入來源無效" }, { status: 403, headers: noStore });
  }
  const body = await request.json().catch(() => ({}));
  const credential = typeof body.credential === "string" ? body.credential : "";
  try {
    const identity = await verifyGoogleAdminCredential(credential);
    const response = NextResponse.json({ authenticated: true, email: identity.email }, { headers: noStore });
    await setAdminSession(response, identity);
    return response;
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Google 登入失敗",
    }, { status: 401, headers: noStore });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginAdminWrite(request)) {
    return NextResponse.json({ error: "登出來源無效" }, { status: 403, headers: noStore });
  }
  const response = NextResponse.json({ authenticated: false }, { headers: noStore });
  clearAdminSession(response);
  return response;
}
