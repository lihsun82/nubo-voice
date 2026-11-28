import { pmsPhotoFloor } from "./pms-photo-floor.ts";
import type { RoomPhotoFloor } from "./nubo-room-photos.ts";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { readJson, writeJson } from "./json-store.ts";

export const PMS_PROPERTY_ID = "ainubo-taichung-jinxin";
const MAX_AGE_MINUTES = 60;
const MAX_BODY_BYTES = 1_000_000;
const STORE_FILE = path.join(process.env.NUBO_DATA_DIR || path.join(process.cwd(), "data"), "pms-snapshot-v1.json");

type Availability = {
  checkIn: string;
  checkOut: string;
  adults: number;
  roomTypes: Array<{ code: string; name: string; availableCount: number }>;
};
type Reservation = {
  lookupKey: string;
  status: "confirmed" | "cancelled" | "no_show";
  stayStatus: "not_checked_in" | "checked_in" | "checked_out" | "cancelled" | "no_show";
  checkIn: string;
  checkOut: string;
  roomTypeName: string;
  photoFloor?: RoomPhotoFloor;
};
export type PmsSnapshot = {
  version: 1;
  propertyId: typeof PMS_PROPERTY_ID;
  generatedAt: string;
  receivedAt: string;
  availability: Availability[];
  reservations: Reservation[];
};

const reservationStatuses = new Set(["confirmed", "cancelled", "no_show"]);
const stayStatuses = new Set(["not_checked_in", "checked_in", "checked_out", "cancelled", "no_show"]);
let writeQueue: Promise<unknown> = Promise.resolve();

function text(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  const cleaned = value.trim();
  if (cleaned.length > max) throw new Error("invalid_payload");
  return cleaned;
}
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
    new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}
function validDateRange(checkIn: unknown, checkOut: unknown) {
  return validDate(checkIn) && validDate(checkOut) && checkOut > checkIn;
}
function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_payload");
  return value as Record<string, unknown>;
}
function requireInt(value: unknown, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new Error("invalid_payload");
  return value as number;
}
function configuredToken() {
  const token = process.env.NUBO_PMS_PUSH_TOKEN?.trim() || "";
  return token.length >= 32 ? token : null;
}
export function pmsConfigured() {
  return Boolean(configuredToken());
}
export function verifyPmsBearer(value: string | null) {
  const token = configuredToken();
  const supplied = value?.match(/^Bearer (.+)$/i)?.[1] || "";
  if (!token || !supplied) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function verifyPmsReservationReadBearer(value: string | null) {
  const configuredDigest = process.env.NUBO_PMS_RESERVATION_READ_TOKEN_SHA256?.trim() || "";
  const supplied = value?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1] || "";
  const writeToken = configuredToken();
  if (!/^[a-f0-9]{64}$/i.test(configuredDigest) || !supplied || !writeToken) return false;
  const digest = Buffer.from(configuredDigest, "hex");
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  const writeDigest = createHash("sha256").update(writeToken).digest();
  return timingSafeEqual(digest, suppliedDigest) && !timingSafeEqual(digest, writeDigest);
}
function lookupKey(bookingReference: string, surname: string) {
  const token = configuredToken();
  if (!token) throw new Error("pms_not_configured");
  const normalized = bookingReference.trim().toUpperCase() + "\\0" + surname.trim().normalize("NFKC").toLowerCase();
  return createHmac("sha256", token).update(normalized).digest("hex");
}
export function pmsFresh(snapshot: PmsSnapshot | null) {
  if (!snapshot) return false;
  const configured = Number(process.env.NUBO_PMS_MAX_AGE_MINUTES);
  const minutes = Number.isFinite(configured) && configured >= 5 && configured <= 1440
    ? configured : MAX_AGE_MINUTES;
  const generatedAt = Date.parse(snapshot.generatedAt);
  return Number.isFinite(generatedAt) && Date.now() - generatedAt <= minutes * 60_000 &&
    generatedAt <= Date.now() + 5 * 60_000;
}
export async function readPmsSnapshot() {
  return readJson<PmsSnapshot | null>(STORE_FILE, null);
}
export function pmsSnapshotStatus(snapshot: PmsSnapshot | null) {
  return {
    propertyId: PMS_PROPERTY_ID,
    configured: pmsConfigured(),
    ready: pmsFresh(snapshot),
    generatedAt: snapshot?.generatedAt || null,
    receivedAt: snapshot?.receivedAt || null,
    availabilityCount: snapshot?.availability.length || 0,
    reservationCount: snapshot?.reservations.length || 0,
  };
}
function parseSnapshot(value: unknown): PmsSnapshot {
  const body = requireObject(value);
  if (body.propertyId !== PMS_PROPERTY_ID) throw new Error("invalid_property");
  const generatedAt = text(body.generatedAt, 40);
  const timestamp = Date.parse(generatedAt);
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(generatedAt) ||
      !validDate(generatedAt.slice(0, 10)) ||
      !Number.isFinite(timestamp) || timestamp > Date.now() + 5 * 60_000 || Date.now() - timestamp > 24 * 60 * 60_000) {
    throw new Error("invalid_generated_at");
  }
  if (!Array.isArray(body.availability) || body.availability.length > 180 ||
      !Array.isArray(body.reservations) || body.reservations.length > 3000) throw new Error("invalid_payload");
  const availability: Availability[] = body.availability.map((item) => {
    const row = requireObject(item);
    if (!validDateRange(row.checkIn, row.checkOut)) throw new Error("invalid_payload");
    const adults = requireInt(row.adults, 1, 20);
    if (!Array.isArray(row.roomTypes) || row.roomTypes.length > 60) throw new Error("invalid_payload");
    const roomTypes = row.roomTypes.map((room) => {
      const r = requireObject(room);
      const code = text(r.code, 60);
      const name = text(r.name, 120);
      if (!code || !name) throw new Error("invalid_payload");
      return { code, name, availableCount: requireInt(r.availableCount, 0, 1000) };
    });
    return { checkIn: row.checkIn as string, checkOut: row.checkOut as string, adults, roomTypes };
  });
  const reservations: Reservation[] = body.reservations.map((item) => {
    const row = requireObject(item);
    const bookingReference = text(row.bookingReference, 100);
    const surname = text(row.surname, 100);
    const status = text(row.status, 30);
    const stayStatus = text(row.stayStatus, 30);
    const roomTypeName = text(row.roomTypeName, 120);
    if (!bookingReference || !surname || !roomTypeName ||
        !reservationStatuses.has(status) || !stayStatuses.has(stayStatus) ||
        !validDateRange(row.checkIn, row.checkOut)) throw new Error("invalid_payload");
    const photoFloor = pmsPhotoFloor(row);
    return {
      ...(photoFloor ? { photoFloor } : {}),
      lookupKey: lookupKey(bookingReference, surname),
      status: status as Reservation["status"],
      stayStatus: stayStatus as Reservation["stayStatus"],
      checkIn: row.checkIn as string,
      checkOut: row.checkOut as string,
      roomTypeName,
    };
  });
  if (new Set(reservations.map((row) => row.lookupKey)).size !== reservations.length) {
    throw new Error("duplicate_reservation");
  }
  return {
    version: 1,
    propertyId: PMS_PROPERTY_ID,
    generatedAt,
    receivedAt: new Date().toISOString(),
    availability,
    reservations,
  };
}
export async function parsePmsRequest(request: Request) {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > MAX_BODY_BYTES) throw new Error("payload_too_large");
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) throw new Error("payload_too_large");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("invalid_json"); }
  return parseSnapshot(parsed);
}
function sameSnapshotContents(previous: PmsSnapshot, next: PmsSnapshot) {
  return previous.version === next.version &&
    previous.propertyId === next.propertyId &&
    previous.generatedAt === next.generatedAt &&
    JSON.stringify(previous.availability) === JSON.stringify(next.availability) &&
    JSON.stringify(previous.reservations) === JSON.stringify(next.reservations);
}

export async function savePmsSnapshot(next: PmsSnapshot, expectedSnapshot: string | null = null) {
  const operation = writeQueue.then(async () => {
    const previous = await readPmsSnapshot();
    const previousTime = previous ? Date.parse(previous.generatedAt) : -Infinity;
    const nextTime = Date.parse(next.generatedAt);
    if (previous && nextTime === previousTime) {
      // A timestamp identifies one immutable snapshot. A lost response may be retried.
      if (sameSnapshotContents(previous, next)) return pmsSnapshotStatus(previous);
      throw new Error("snapshot_conflict");
    }
    if (expectedSnapshot !== null && expectedSnapshot !== (previous?.generatedAt ?? "empty")) {
      throw new Error("snapshot_conflict");
    }
    if (nextTime < previousTime) {
      throw new Error("outdated_snapshot");
    }
    await writeJson(STORE_FILE, next);
    return pmsSnapshotStatus(next);
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
}
export async function findPmsReservation(bookingReference: string, surname: string) {
  const snapshot = await readPmsSnapshot();
  if (!pmsFresh(snapshot)) return { ready: false as const };
  const key = lookupKey(bookingReference, surname);
  const reservation = snapshot!.reservations.find((row) => row.lookupKey === key);
  if (!reservation) return { ready: true as const, matched: false as const, asOf: snapshot!.generatedAt };
  const { lookupKey: _lookupKey, ...safe } = reservation;
  return { ready: true as const, matched: true as const, reservation: safe, asOf: snapshot!.generatedAt };
}
export async function findPmsAvailability(checkIn: string, checkOut: string, adults: number) {
  const snapshot = await readPmsSnapshot();
  if (!pmsFresh(snapshot)) return { ready: false as const };
  const row = snapshot!.availability.find((item) =>
    item.checkIn === checkIn && item.checkOut === checkOut && item.adults === adults);
  return row
    ? { ready: true as const, covered: true as const, asOf: snapshot!.generatedAt, roomTypes: row.roomTypes }
    : { ready: true as const, covered: false as const, asOf: snapshot!.generatedAt };
}
export function validPmsQueryDateRange(checkIn: unknown, checkOut: unknown) {
  return validDateRange(checkIn, checkOut);
}
