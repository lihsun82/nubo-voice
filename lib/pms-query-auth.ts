import type { NextRequest } from "next/server";
import { getAdminSession, hasGuestDeviceSession } from "@/lib/nubo-admin-auth";
import { verifyPmsBearer } from "@/lib/pms-snapshot";

export async function allowPmsQuery(request: NextRequest) {
  if (verifyPmsBearer(request.headers.get("authorization"))) return true;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  if (origin) {
    const publicOrigin = new URL(process.env.NUBO_PUBLIC_URL || "https://nubo.ainubo.com").origin;
    const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const localOrigin = forwarded ? "https://" + forwarded : "";
    if (origin !== publicOrigin && origin !== localOrigin &&
        !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) return false;
  }
  return Boolean(await getAdminSession(request) || await hasGuestDeviceSession(request));
}
