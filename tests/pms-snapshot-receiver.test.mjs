import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rmdir, unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const require = createRequire(import.meta.url);
const writeToken = "mock-pms-snapshot-writer-only-for-unit-tests";
const readToken = "a".repeat(64);
const propertyId = "ainubo-taichung-jinxin";
const checkIn = "2026-11-16";
const checkOut = "2026-11-17";
const bookingReference = "TEST-BOOKING-ONE";
const surname = "林";
const availability = [{
  checkIn, checkOut, adults: 2,
  roomTypes: [{ code: "SYNTHETIC", name: "測試房型", availableCount: 0 }],
}];
const reservations = [{
  bookingReference, surname, checkIn, checkOut,
  roomTypeName: "測試房型", status: "confirmed", stayStatus: "not_checked_in",
}];

function compiledRoute(name) {
  return require(`../.next/server/app/api/pms/v1/${name}/route.js`).routeModule.userland;
}

function request(name, method, { body, token = writeToken, origin, expected } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (origin) headers.Origin = origin;
  if (expected !== undefined) headers["X-PMS-Expected-Snapshot"] = expected;
  const input = new Request(`https://pms.example.test/api/pms/v1/${name}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  // The compiled Next route reads cookies via NextRequest; fixtures have no session cookie.
  input.cookies = new Map();
  return input;
}

async function check(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json();
}

// Execute after npm run build. This imports the actual compiled route handlers.
test("the compiled PMS v1 routes accept real ISO dates and enforce read scope", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "nubo-pms-receiver-fixture-"));
  const file = join(directory, "pms-snapshot-v1.json");
  t.after(async () => {
    await unlink(file).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    await rmdir(directory);
  });

  process.env.NUBO_DATA_DIR = directory;
  process.env.NUBO_PMS_PUSH_TOKEN = writeToken;
  process.env.NUBO_PMS_RESERVATION_READ_TOKEN_SHA256 = createHash("sha256").update(readToken).digest("hex");
  process.env.NUBO_PMS_MAX_AGE_MINUTES = "60";
  let now = Date.parse("2026-11-16T02:01:00Z");
  t.mock.method(Date, "now", () => now);

  const snapshotRoute = compiledRoute("snapshot");
  const roomRoute = compiledRoute("availability");
  const reservationRoute = compiledRoute("reservation");
  const first = "2026-11-16T10:00:00+08:00";
  const next = "2026-11-16T10:00:05.125+08:00";
  const latest = "2026-11-16T02:00:10.250Z";
  const fixture = (generatedAt) => ({ propertyId, generatedAt, availability, reservations });
  const put = (body, options) => snapshotRoute.PUT(request("snapshot", "PUT", { body, ...options }));
  const get = (options) => snapshotRoute.GET(request("snapshot", "GET", options));
  const room = (body, options) => roomRoute.POST(request("availability", "POST", { body, ...options }));
  const booking = (body, options) => reservationRoute.POST(request("reservation", "POST", { body, ...options }));

  await t.test("reports an empty store, then accepts Taipei offset, milliseconds and UTC", async () => {
    assert.deepEqual(await check(await get(), 200), {
      propertyId, configured: true, ready: false, generatedAt: null, receivedAt: null,
      availabilityCount: 0, reservationCount: 0,
    });
    for (const timestamp of [first, next, latest]) {
      const options = timestamp === first ? { expected: "empty" } : undefined;
      const response = await check(await put(fixture(timestamp), options), 200);
      assert.equal(response.ok, true);
      assert.equal(response.generatedAt, timestamp);
      assert.equal(response.availabilityCount, 1);
      assert.equal(response.reservationCount, 1);
    }
    const status = await check(await get(), 200);
    assert.equal(status.propertyId, propertyId);
    assert.equal(status.generatedAt, latest);
    assert.equal(status.ready, true);
    const persisted = JSON.parse(await readFile(file, "utf8"));
    const [row] = persisted.reservations;
    assert.match(row.lookupKey, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(row, "bookingReference"), false);
    assert.equal(Object.hasOwn(row, "surname"), false);
  });

  await t.test("rejects impossible days, non-increasing stays and outdated snapshots", async () => {
    assert.deepEqual(await check(await put(fixture("2026-11-31T10:00:00+08:00")), 400),
      { ok: false, error: "invalid_generated_at" });
    const badStay = { ...fixture(latest), reservations: [{ ...reservations[0], checkIn: "2026-02-30" }] };
    assert.deepEqual(await check(await put(badStay), 400), { ok: false, error: "invalid_payload" });
    const sameDay = { ...fixture(latest), reservations: [{ ...reservations[0], checkOut: checkIn }] };
    assert.deepEqual(await check(await put(sameDay), 400), { ok: false, error: "invalid_payload" });
    assert.deepEqual(await check(await put(fixture(next)), 409), { ok: false, error: "outdated_snapshot" });
    assert.equal((await check(await get(), 200)).generatedAt, latest);
  });

  await t.test("distinguishes zero rooms, uncovered dates and malformed queries", async () => {
    const available = await check(await room({ checkIn, checkOut, adults: 2 }), 200);
    assert.equal(available.covered, true);
    assert.equal(available.roomTypes[0].availableCount, 0);
    const uncovered = await check(await room({ checkIn, checkOut, adults: 1 }), 200);
    assert.equal(uncovered.covered, false);
    assert.equal(Object.hasOwn(uncovered, "roomTypes"), false);
    assert.deepEqual(await check(await room({ checkIn: "2026-02-30", checkOut, adults: 2 }), 400),
      { error: "invalid_payload" });
    assert.deepEqual(await check(await room(null), 400), { error: "invalid_payload" });
    assert.deepEqual(await check(await booking(null), 400), { error: "invalid_payload" });
  });

  await t.test("restricts the dedicated credential to a reservation check and keeps the response minimized", async () => {
    const match = await check(await booking({ bookingReference, surname }, { token: readToken }), 200);
    assert.equal(match.matched, true);
    assert.deepEqual(match.reservation, {
      checkIn, checkOut, roomTypeName: "測試房型", status: "confirmed", stayStatus: "not_checked_in",
    });
    const wrong = await check(await booking({ bookingReference, surname: "王" }, { token: readToken }), 200);
    assert.deepEqual(wrong, { propertyId, ready: true, matched: false, asOf: latest });
    assert.equal((await check(await booking({ bookingReference, surname }), 200)).matched, true);
    await check(await booking({ bookingReference, surname }, {
      token: readToken, origin: "https://nubosci.ainubohub.com",
    }), 401);
    await check(await room({ checkIn, checkOut, adults: 2 }, { token: readToken }), 401);
    await check(await put(fixture(latest), { token: readToken }), 401);
    await check(await get({ token: readToken }), 401);
    await check(await booking({ bookingReference, surname }, { token: "b".repeat(64) }), 401);
  });

  await t.test("keeps an intervening write and recognizes an identical retry inside the write queue", async () => {
    const observed = await check(await get(), 200);
    const committedAt = "2026-11-16T02:00:20Z";
    const newerAt = "2026-11-16T02:00:30Z";
    const original = { ...fixture(committedAt), reservations: [] };
    const saved = await check(await put(original, { expected: observed.generatedAt }), 200);
    assert.equal(saved.reservationCount, 0);

    const conflict = await check(await put(fixture(newerAt), { expected: observed.generatedAt }), 409);
    assert.deepEqual(conflict, { ok: false, error: "snapshot_conflict" });
    assert.deepEqual(await check(await put(original, { expected: observed.generatedAt }), 200), saved);
    assert.deepEqual(await check(await put(fixture(committedAt)), 409), { ok: false, error: "snapshot_conflict" });
    assert.equal((await check(await get(), 200)).generatedAt, committedAt);
  });

  await t.test("returns stale data as unavailable", async () => {
    now += 61 * 60_000;
    assert.equal((await check(await get(), 200)).ready, false);
    assert.deepEqual(await check(await room({ checkIn, checkOut, adults: 2 }), 503),
      { error: "pms_data_unavailable" });
    assert.deepEqual(await check(await booking({ bookingReference, surname }, { token: readToken }), 503),
      { error: "pms_data_unavailable" });
  });
});
