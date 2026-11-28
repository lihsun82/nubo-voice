import { isRoomPhotoFloor, type RoomPhotoFloor } from "./nubo-room-photos.ts";

type Row = Record<string, unknown>;

function floorValue(value: unknown, fromRoom = false): RoomPhotoFloor | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).normalize("NFKC").trim().toUpperCase();
  const match = fromRoom ? /^0?([235678])\d{2}$/.exec(text) : /^(?:F)?([235678])(?:F|樓)?$/.exec(text);
  const floor = match && match[1] + "F";
  return isRoomPhotoFloor(floor) ? floor : null;
}

// This runs on the server. Keep only the floor of a verified PMS row, never the room identifier.
export function pmsPhotoFloor(row: Row, scope: readonly number[] = []): RoomPhotoFloor | null {
  const values: (RoomPhotoFloor | null)[] = [];
  const read = (r: Row) => {
    for (const key of ["floor", "floorNumber", "photoFloor", "roomNumber", "roomNo", "room_number"]) {
      if (r[key] != null && r[key] !== "") values.push(floorValue(r[key], key.startsWith("room")));
    }
  };
  read(row);
  if (row.recommendedRoom && typeof row.recommendedRoom === "object") read(row.recommendedRoom as Row);
  if (!values.length && Array.isArray(row.availableFloors)) {
    for (const floor of row.availableFloors) values.push(floorValue(floor));
  }
  if (!values.length && Array.isArray(row.availableRooms)) {
    for (const room of row.availableRooms) {
      if (room && typeof room === "object") {
        const previous = values.length;
        read(room);
        if (values.length === previous) values.push(null);
      } else values.push(floorValue(room, true));
    }
  }
  if (scope.length === 1) values.push(floorValue(scope[0]));
  const floor = values[0];
  return floor && values.every(value => value === floor) && (!scope.length || scope.includes(Number(floor[0]))) ? floor : null;
}
