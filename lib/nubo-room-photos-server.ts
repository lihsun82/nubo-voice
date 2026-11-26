import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { isRoomPhotoId, ROOM_PHOTO_FLOORS, type RoomPhoto, type RoomPhotoFloor } from "./nubo-room-photos.ts";

const PHOTO_ROOT = path.join(process.env.NUBO_DATA_DIR || path.join(process.cwd(), "data"), "nubo-room-photos");

function photo(floor: RoomPhotoFloor, id: string): RoomPhoto {
  return { id, url: `/api/room-photos/${floor}/${id}` };
}

function isMissing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export async function listRoomPhotos() {
  return Promise.all(ROOM_PHOTO_FLOORS.map(async (floor) => {
    try {
      const folder = path.join(PHOTO_ROOT, floor);
      const entries = await fs.readdir(folder, { withFileTypes: true });
      return {
        floor,
        photos: entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".webp") && isRoomPhotoId(entry.name.slice(0, -5)))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((entry) => photo(floor, entry.name.slice(0, -5))),
      };
    } catch (error) {
      if (!isMissing(error)) throw error;
      return { floor, photos: [] };
    }
  }));
}

export async function encodeRoomPhoto(input: Buffer, contentType: string) {
  const jpeg = contentType === "image/jpeg" && input.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const png = contentType === "image/png" && input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = contentType === "image/webp" && input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP";
  if (!jpeg && !png && !webp) return null;
  // Re-encode the pixels instead of saving the original file or its metadata.
  return sharp(input, { limitInputPixels: 50_000_000, failOn: "error" })
    .autoOrient()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer()
    .catch(() => null);
}

export async function saveRoomPhoto(floor: RoomPhotoFloor, bytes: Buffer) {
  const id = createHash("sha256").update(bytes).digest("hex");
  const folder = path.join(PHOTO_ROOT, floor);
  const target = path.join(folder, id + ".webp");
  const temp = path.join(folder, "." + randomUUID() + ".tmp");
  await fs.mkdir(folder, { recursive: true });
  try {
    await fs.writeFile(temp, bytes, { flag: "wx" });
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => undefined);
  }
  return photo(floor, id);
}

export async function readRoomPhoto(floor: RoomPhotoFloor, id: string) {
  return fs.readFile(path.join(PHOTO_ROOT, floor, id + ".webp")).catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
}

export async function removeRoomPhoto(floor: RoomPhotoFloor, id: string) {
  await fs.rm(path.join(PHOTO_ROOT, floor, id + ".webp"), { force: true });
}
