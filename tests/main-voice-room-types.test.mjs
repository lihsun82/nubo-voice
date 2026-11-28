import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const propertyId = "ainubo-taichung-jinxin";
const token = "demo-read-only-main-voice-token-for-tests";
const view = "guest-room-types-v1";
const floorView = "guest-room-types-by-floor-v1";
const roomTypes = [
  { code: "D", name: "大床雙人房", availableCount: 0 },
  { code: "T", name: "雙床雙人房", availableCount: 2 },
];
const day = offset => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

for (const [path, query, env] of [
  ["availability", { checkIn: day(1), checkOut: day(3), adults: 2 }, "NUBO_PMS_AVAILABILITY_URL"],
  ["rest-availability", { startAt: day(1) + "T10:00:00+08:00", durationMinutes: 120 }, "NUBO_PMS_REST_AVAILABILITY_URL"],
]) {
  test("main guest voice requests verified room types at " + path, async t => {
    const endpoint = "https://demo-pms.example/" + path;
    process.env[env] = endpoint;
    process.env.NUBO_PMS_AVAILABILITY_TOKEN = token;
    process.env.NUBO_PMS_PUSH_TOKEN = token;
    const { POST } = require("../.next/server/app/api/pms/v1/" + path + "/route.js").routeModule.userland;
    const input = (params = {}) => {
      const req = new Request("https://example.test/api/pms/v1/" + path, {
        method: "POST",
        headers: { Accept: "application/vnd.nubosci.room-types.v1+json", Authorization: "Bearer " + token },
        body: JSON.stringify({ ...query, ...params }),
      });
      req.cookies = new Map();
      return req;
    };
    const live = { ...query, propertyId, inventoryView: view, asOf: new Date().toISOString(), roomTypes };
    let upstream = live;
    let expectedFloors = [];
    const fetchMock = t.mock.method(globalThis, "fetch", async (target, options) => {
      assert.equal(target, endpoint);
      assert.equal(options.headers["X-Nubo-Inventory-View"], expectedFloors.length ? floorView : view);
      assert.deepEqual(JSON.parse(options.body), {
        propertyId,
        ...query,
        ...(expectedFloors.length ? { floors: expectedFloors } : {}),
      });
      return Response.json(upstream);
    });
    const result = await POST(input());
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).roomTypes, roomTypes);
    for (const overrides of [
      { inventoryView: undefined, availableCount: 2 }, { asOf: "2000-01-01T00:00:00Z" },
      ...(path === "availability" ? [{ covered: false }] : [{ durationMinutes: 60 }]),
    ]) {
      upstream = { ...live, ...overrides };
      assert.equal((await POST(input())).status, 503);
    }
    assert.equal(fetchMock.mock.callCount(), 4);
    for (const [requiredAmenities, floors] of [
      [["bidet"], [7, 8]],
      [["bathtub"], [8]],
      [["bidet", "bathtub"], [8]],
    ]) {
      expectedFloors = floors;
      const soldOut = roomTypes.map(room => ({ ...room, availableCount: 0 }));
      upstream = { ...live, inventoryView: floorView, floors: [...floors].reverse(), roomTypes: soldOut };
      const scoped = await POST(input({ requiredAmenities }));
      assert.equal(scoped.status, 200);
      const body = await scoped.json();
      assert.equal(body.inventoryView, floorView);
      assert.deepEqual(body.floors, floors);
      assert.deepEqual(body.roomTypes, soldOut);

      for (const invalidScope of [
        live,
        { ...live, inventoryView: floorView, floors: undefined },
        { ...live, inventoryView: floorView, floors: [5, ...floors] },
        { ...live, inventoryView: floorView, floors, roomTypes: [] },
      ]) {
        upstream = invalidScope;
        const rejected = await POST(input({ requiredAmenities }));
        assert.equal(rejected.status, 503);
        assert.deepEqual(await rejected.json(), { error: "floor_inventory_unavailable" });
      }
    }
    const beforeInvalid = fetchMock.mock.callCount();
    assert.equal((await POST(input({ requiredAmenities: ["5F"] }))).status, 400);
    assert.equal(fetchMock.mock.callCount(), beforeInvalid);
  });
}
