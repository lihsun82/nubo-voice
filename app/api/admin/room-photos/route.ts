import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, isSameOriginAdminWrite } from "@/lib/nubo-admin-auth";
import { isRoomPhotoFloor, isRoomPhotoId, ROOM_PHOTO_ACCEPT, ROOM_PHOTO_MAX_BYTES } from "@/lib/nubo-room-photos";
import { encodeRoomPhoto, removeRoomPhoto, saveRoomPhoto } from "@/lib/nubo-room-photos-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

function failed(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers });
}

async function authorize(request: NextRequest) {
  if (!isSameOriginAdminWrite(request)) return failed("操作來源無效", 403);
  if (!await getAdminSession(request)) return failed("請先登入後台", 401);
  return null;
}

async function readUpload(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, bytes);
      bytes += value.byteLength;
      if (bytes > ROOM_PHOTO_MAX_BYTES) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;
  const floor = request.nextUrl.searchParams.get("floor");
  if (!isRoomPhotoFloor(floor)) return failed("請選擇 2F 至 8F", 400);
  const mime = request.headers.get("content-type") || "";
  if (!ROOM_PHOTO_ACCEPT.split(",").includes(mime)) return failed("請上傳 JPEG、PNG 或 WebP 照片", 415);
  if (!request.body) return failed("請選擇照片", 400);
  if (Number(request.headers.get("content-length")) > ROOM_PHOTO_MAX_BYTES) {
    return failed("每張照片上限 8 MB", 413);
  }
  try {
    const upload = await readUpload(request.body);
    if (!upload) return failed("每張照片上限 8 MB", 413);
    const encoded = await encodeRoomPhoto(upload, mime);
    if (!encoded) return failed("無法讀取照片，請確認檔案格式和內容", 422);
    return NextResponse.json({ photo: await saveRoomPhoto(floor, encoded) }, { status: 201, headers });
  } catch {
    return failed("照片上傳失敗，請再試一次", 500);
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;
  const floor = request.nextUrl.searchParams.get("floor");
  const id = request.nextUrl.searchParams.get("id");
  if (!isRoomPhotoFloor(floor) || !isRoomPhotoId(id)) return failed("照片資料無效", 400);
  try {
    await removeRoomPhoto(floor, id);
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return failed("照片移除失敗，請再試一次", 500);
  }
}
