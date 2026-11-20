import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const propertyId = "ainubo-taichung-jinxin";
const token = "demo-read-only-main-voice-token-for-tests";
const view = "guest-room-types-v1";
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
    const input = () => {
      const req = new Request("https://example.test/api/pms/v1/" + path, {
        method: "POST",
        headers: { Accept: "application/vnd.nubosci.room-types.v1+json", Authorization: "Bearer " + token },
        body: JSON.stringify(query),
      });
      req.cookies = new Map();
      return req;
    };
    const live = { ...query, propertyId, inventoryView: view, asOf: new Date().toISOString(), roomTypes };
    let upstream = live;
    const fetchMock = t.mock.method(globalThis, "fetch", async (target, options) => {
      assert.equal(target, endpoint);
      assert.equal(options.headers["X-Nubo-Inventory-View"], view);
      assert.deepEqual(JSON.parse(options.body), { propertyId, ...query });
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
  });
}
