export const guestRoomTypeFloorView = "guest-room-types-by-floor-v1";

export function floorsForRequiredAmenities(value: unknown): readonly number[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 2 ||
      !value.every((amenity) => amenity === "bidet" || amenity === "bathtub")) {
    return null;
  }
  if (value.includes("bathtub")) return [8];
  return value.includes("bidet") ? [7, 8] : [];
}

export function hasPmsFloorScope(result: Record<string, unknown>, floors: readonly number[]) {
  const applied = result.floors;
  return result.inventoryView === guestRoomTypeFloorView &&
    Array.isArray(applied) && applied.length === floors.length &&
    floors.every((floor) => applied.includes(floor));
}
