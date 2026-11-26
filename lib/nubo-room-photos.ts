export const ROOM_PHOTO_FLOORS = ["2F", "3F", "4F", "5F", "6F", "7F", "8F"] as const;
export type RoomPhotoFloor = (typeof ROOM_PHOTO_FLOORS)[number];
export type RoomPhoto = { id: string; url: string };
export type RoomPhotoFloorGallery = { floor: RoomPhotoFloor; photos: RoomPhoto[] };

export const ROOM_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const ROOM_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

export function isRoomPhotoFloor(value: unknown): value is RoomPhotoFloor {
  return typeof value === "string" && ROOM_PHOTO_FLOORS.some((floor) => floor === value);
}

export function isRoomPhotoId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
