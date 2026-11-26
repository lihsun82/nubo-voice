import { NextResponse } from "next/server";
import { listRoomPhotos } from "@/lib/nubo-room-photos-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    return NextResponse.json({ floors: await listRoomPhotos() }, { headers });
  } catch {
    return NextResponse.json({ error: "room_photos_unavailable" }, { status: 503, headers });
  }
}
