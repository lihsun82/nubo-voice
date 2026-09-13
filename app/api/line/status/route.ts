import { NextResponse } from "next/server";
import { getHotelLineStatus } from "@/lib/nubo-hotel-line";
import { getLineRemoteConfigStatus } from "@/lib/line-messaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = getLineRemoteConfigStatus();
  const hotelGuestAlerts = getHotelLineStatus();
  return NextResponse.json({
    ok:
      status.channelSecretConfigured &&
      status.accessTokenConfigured &&
      status.allowedUserCount > 0,
    ...status,
    hotelGuestAlerts,
    webhookPath: "/api/line/webhook",
    mode:
      status.allowedUserCount > 0
        ? "authorized"
        : "pairing_only_no_commands_will_run",
  });
}
