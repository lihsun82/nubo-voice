import { NextRequest, NextResponse } from "next/server";
import {
  parsePmsRequest, pmsConfigured, pmsSnapshotStatus,
  readPmsSnapshot, savePmsSnapshot, verifyPmsBearer,
} from "@/lib/pms-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

function authorize(request: NextRequest) {
  if (!pmsConfigured()) return NextResponse.json({ error: "pms_not_configured" }, { status: 503, headers });
  if (!verifyPmsBearer(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;
  return NextResponse.json(pmsSnapshotStatus(await readPmsSnapshot()), { headers });
}

export async function PUT(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;
  if (request.headers.has("origin")) {
    return NextResponse.json({ error: "server_to_server_only" }, { status: 403, headers });
  }
  try {
    const next = await parsePmsRequest(request);
    const status = await savePmsSnapshot(next, request.headers.get("x-pms-expected-snapshot"));
    return NextResponse.json({ ok: true, ...status }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_payload";
    const conflict = code === "outdated_snapshot" || code === "snapshot_conflict";
    const status = conflict ? 409 : code === "payload_too_large" ? 413 : 400;
    return NextResponse.json({ ok: false, error: code }, { status, headers });
  }
}
