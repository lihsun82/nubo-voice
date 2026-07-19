import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

function sanitizeHttpUrl(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    const allowed =
      url.protocol === "https:" ||
      (url.protocol === "http:" && isLocalHostname(url.hostname));

    return allowed ? url.toString() : "";
  } catch {
    return "";
  }
}

function hasSafeWebSocketUrl(value: string | undefined) {
  const raw = value?.trim();
  if (!raw) return false;

  try {
    const url = new URL(raw);
    return (
      url.protocol === "wss:" ||
      (url.protocol === "ws:" && isLocalHostname(url.hostname))
    );
  } catch {
    return false;
  }
}

export async function GET() {
  const h5Url = sanitizeHttpUrl(
    process.env.XIAOZHI_H5_URL ||
      process.env.NEXT_PUBLIC_XIAOZHI_H5_URL,
  );
  const websocketConfigured = hasSafeWebSocketUrl(
    process.env.XIAOZHI_WS_URL,
  );

  return NextResponse.json({
    ok: true,
    provider: "xiaozhi-self-hosted",
    configured: Boolean(h5Url),
    h5Url: h5Url || null,
    websocketConfigured,
    publicThirdPartyBackendEnabled: false,
  });
}
