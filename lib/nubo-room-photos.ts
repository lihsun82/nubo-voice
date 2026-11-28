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

export type RoomPhotoRequest = { floor: RoomPhotoFloor | null };

export const ROOM_PHOTO_TOOL = {
  name: "show_room_photos",
  description: "旅客想看本館客房照片時開相簿，帶入正在介紹的已查證房型代碼。樓層由本次 PMS 結果決定；一般瀏覽可省略代碼。",
  parameters: { type: "OBJECT", properties: { roomCode: { type: "STRING", description: "正在介紹的 PMS 房型代碼，例如 CD。不得填房號或猜樓層。" } } },
};
export const ROOM_PHOTO_GUIDANCE = "旅客想看本館房型照片，呼叫 show_room_photos。若前一輪正在介紹或本輪指定某個 PMS 房型，傳它的 roomCode。相簿會定位到 PMS 可核對的樓層，這是樓層相簿，不代表照片一定是該間實房。未確認樓層只請旅客選樓層。絕不唸房號。照片張數及有無依相簿畫面，不要自行宣稱已顯示特定照片。";
