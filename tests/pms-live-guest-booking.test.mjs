import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const propertyId = "ainubo-taichung-jinxin";
const checkIn = "2026-12-01";
const checkOut = "2026-12-02";
const token = "test-pms-read-token-that-is-long-enough";

function route(path) {
  return require(`../.next/server/app/api/${path}/route.js`).routeModule.userland;
}

function availabilityRequest() {
  const request = new Request("https://nubo.ainubo.com/api/pms/v1/availability", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ checkIn, checkOut, adults: 2 }),
  });
  request.cookies = new Map();
  return request;
}

// Execute after npm run build; exercise the compiled guest-facing routes.
test("live PMS lookup requires a matching fresh response and booking link stays gated", async (t) => {
  process.env.NUBO_PMS_PUSH_TOKEN = token;
  process.env.NUBO_PMS_AVAILABILITY_URL = "https://pms.example.test/api/nubo/availability";
  process.env.NUBO_PMS_AVAILABILITY_TOKEN = token;
  process.env.NUBO_GUEST_BOOKING_URL = "https://nubosci.ainubohub.com/book";
  process.env.NUBO_GUEST_BOOKING_ENABLED = "false";

  const availability = route("pms/v1/availability");
  const bookingLink = route("guest-booking-link");
  const responseBody = () => ({
    propertyId, checkIn, checkOut, adults: 2, asOf: new Date().toISOString(),
    inventoryView: "guest-room-types-v1",
    roomTypes: [{ code: "TEST", name: "測試房型", availableCount: 2 }],
  });

  await t.test("queries PMS at the time of request", async (t) => {
    const calls = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
      calls.push({ url, options });
      return Response.json(responseBody());
    });
    const response = await availability.POST(availabilityRequest());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json();
    assert.equal(result.source, "live");
    assert.equal(result.covered, true);
    assert.equal(result.roomTypes[0].availableCount, 2);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, process.env.NUBO_PMS_AVAILABILITY_URL);
    assert.equal(calls[0].options.redirect, "error");
    assert.equal(calls[0].options.headers.Authorization, `Bearer ${token}`);
    assert.equal(calls[0].options.headers["X-Nubo-Inventory-View"], "guest-room-types-v1");
  });

  await t.test("rejects mismatched and stale PMS results", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ ...responseBody(), propertyId: "other-property" }));
    assert.equal((await availability.POST(availabilityRequest())).status, 503);
    t.mock.restoreAll();
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ ...responseBody(), asOf: "2020-01-01T00:00:00Z" }));
    assert.equal((await availability.POST(availabilityRequest())).status, 503);
  });

  await t.test("rejects an ordinary PMS response without guest inventory", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
      const { inventoryView, ...ordinaryResponse } = responseBody();
      return Response.json(ordinaryResponse);
    });
    assert.equal((await availability.POST(availabilityRequest())).status, 503);
  });

  await t.test("keeps a confirmed zero distinct from an unavailable lookup", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ ...responseBody(), roomTypes: [
        { code: "TEST", name: "測試房型", availableCount: 0 },
      ] }));
    const soldOut = await (await availability.POST(availabilityRequest())).json();
    assert.equal(soldOut.covered, true);
    assert.equal(soldOut.roomTypes[0].availableCount, 0);
    t.mock.restoreAll();
    t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
    const unavailable = await availability.POST(availabilityRequest());
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { error: "pms_data_unavailable" });
  });

  assert.deepEqual(await (await bookingLink.GET()).json(), { enabled: false });
  process.env.NUBO_GUEST_BOOKING_ENABLED = "true";
  assert.deepEqual(await (await bookingLink.GET()).json(), {
    enabled: true, url: "https://nubosci.ainubohub.com/book",
  });
  process.env.NUBO_GUEST_BOOKING_URL = "http://example.test/book";
  assert.deepEqual(await (await bookingLink.GET()).json(), { enabled: false });
});
