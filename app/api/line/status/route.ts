import { NextResponse } from "next/server";
import { getLineRemoteConfigStatus } from "@/lib/line-messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = getLineRemoteConfigStatus();
  return NextResponse.json({
    ok:
      status.channelSecretConfigured &&
      status.accessTokenConfigured &&
      status.allowedUserCount > 0,
    ...status,
    webhookPath: "/api/line/webhook",
    mode:
      status.allowedUserCount > 0
        ? "authorized"
        : "pairing_only_no_commands_will_run",
  });
}
