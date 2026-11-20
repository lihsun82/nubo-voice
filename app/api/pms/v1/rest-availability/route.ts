import { NextRequest, NextResponse } from "next/server";
import { allowPmsQuery } from "@/lib/pms-query-auth";
import { PmsLiveError } from "@/lib/pms-live-availability";
import { queryLivePmsRestAvailability, validRestQuery } from "@/lib/pms-live-rest-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  if (!await allowPmsQuery(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  }
  const raw = await request.text();
  if (raw.length > 2048) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers });
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !validRestQuery(body.startAt, body.durationMinutes)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers });
  }
  try {
    const byRoomType = request.headers.get("accept") === "application/vnd.nubosci.room-types.v1+json";
    const result = await queryLivePmsRestAvailability(
      body.startAt as string, body.durationMinutes as number, fetch, byRoomType);
    if (!result) throw new PmsLiveError("pms_data_unavailable");
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof PmsLiveError && error.code === "invalid_query") {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers });
    }
    if (error instanceof PmsLiveError && error.code === "rate_limited") {
      return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
    }
    return NextResponse.json({ error: "pms_data_unavailable" }, { status: 503, headers });
  }
}
