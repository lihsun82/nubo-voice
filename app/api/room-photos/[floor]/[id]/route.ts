import { isRoomPhotoFloor, isRoomPhotoId } from "@/lib/nubo-room-photos";
import { readRoomPhoto } from "@/lib/nubo-room-photos-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ floor: string; id: string }> }) {
  const { floor, id } = await params;
  if (!isRoomPhotoFloor(floor) || !isRoomPhotoId(id)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const image = await readRoomPhoto(floor, id);
  if (!image) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(image), { headers: {
    "Content-Type": "image/webp",
    "Cache-Control": "public, max-age=60, must-revalidate",
    "X-Content-Type-Options": "nosniff",
  } });
}
