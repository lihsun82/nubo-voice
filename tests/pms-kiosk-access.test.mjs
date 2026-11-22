import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const propertyId = "ainubo-taichung-jinxin";
const origin = "https://nubo.ainubo.com";
const view = "application/vnd.nubosci.room-types.v1+json";
const roomTypes = [
  { code: "D", name: "大床雙人房", availableCount: 0 },
  { code: "T", name: "雙床雙人房", availableCount: 2 },
];
const stayQuery = { checkIn: "2026-12-01", checkOut: "2026-12-02", adults: 2 };
const restQuery = { startAt: "now", durationMinutes: 120 };
const testToken = "test-pms-secret-not-a-live-token-32-characters";

function route(path) {
  return require("../.next/server/app/api/pms/v1/" + path + "/route.js").routeModule.userland;
}

function input(path, body, headers = {}) {
  const request = new Request(origin + "/api/pms/v1/" + path, {
    method: "POST",
    headers: {
      Origin: origin,
      "Sec-Fetch-Site": "same-origin",
      Accept: view,
      "Content-Type": "application/json",
      "X-Forwarded-For": "198.51.100.120",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  request.cookies = new Map();
  return request;
}

function responseBody(path) {
  return {
    propertyId,
    inventoryView: "guest-room-types-v1",
    asOf: new Date().toISOString(),
    roomTypes,
    ...(path === "availability" ? { ...stayQuery, covered: true } :
      { startAt: new Date().toISOString(), durationMinutes: 120 }),
  };
}

process.env.NUBO_PUBLIC_URL = origin;
process.env.NUBO_PMS_PUSH_TOKEN = testToken;
process.env.NUBO_PMS_AVAILABILITY_TOKEN = testToken;
process.env.NUBO_PMS_AVAILABILITY_URL = "https://pms.example.test/api/voice/v1/availability";
process.env.NUBO_PMS_REST_AVAILABILITY_URL = "https://pms.example.test/api/voice/v1/rest-availability";

for (const [path, body] of [
  ["availability", stayQuery],
  ["rest-availability", restQuery],
]) {
  test("unpaired hotel guest can use " + path + " for PUBLIC sellable room counts only", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (url, options) => {
      calls += 1;
      assert.match(url, /^https:\/\/pms\.example\.test\/api\/voice\/v1\//);
      assert.equal(options.headers.Authorization, "Bearer " + testToken);
      assert.equal(options.headers["X-Nubo-Inventory-View"], "guest-room-types-v1");
      return Response.json(responseBody(path));
    });
    const result = await route(path).POST(input(path, body));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("cache-control"), "no-store");
    const payload = await result.json();
    assert.deepEqual(payload.roomTypes, roomTypes);
    assert.equal("reservations" in payload, false);
    assert.equal("guestName" in payload, false);
    assert.equal(calls, 1);

    // Reject other origins, cross-site requests and non-room-type views.
    for (const headers of [
      { Origin: "https://attacker.example" },
      { "Sec-Fetch-Site": "cross-site" },
      { Accept: "application/json" },
      { Origin: "", "Sec-Fetch-Site": "", Referer: "" },
    ]) {
      const denied = await route(path).POST(input(path, body, headers));
      assert.equal(denied.status, 401);
    }
    assert.equal(calls, 1, "unauthorized requests must never reach PMS");

    // Android WebView may omit Origin, but must supply matching Referer + Fetch Metadata.
    const native = await route(path).POST(input(path, body, {
      Origin: "", Referer: origin + "/?native=stable-3",
    }));
    assert.equal(native.status, 200);

    // PMS failure is not "sold out" and must not leak snapshot fallback.
    t.mock.restoreAll();
    t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
    const missing = await route(path).POST(input(path, body));
    assert.equal(missing.status, 503);
    assert.deepEqual(await missing.json(), { error: "pms_data_unavailable" });

    t.mock.restoreAll();
    t.mock.method(globalThis, "fetch", async () => Response.json({
      ...responseBody(path), roomTypes: [],
    }));
    const incomplete = await route(path).POST(input(path, body));
    assert.equal(incomplete.status, 503);
    assert.deepEqual(await incomplete.json(), { error: "pms_data_unavailable" });
  });
}

test("same-origin unpaired access NEVER authorizes reservation lookup", async () => {
  const reservation = route("reservation");
  const denied = await reservation.POST(input("reservation", {
    bookingReference: "TEST-12345", surname: "王",
  }));
  assert.equal(denied.status, 401);
});

test("public inventory requests are rate-limited before reaching the PMS", async (t) => {
  const path = "availability";
  const body = stayQuery;
  const endpoint = route(path);
  let outgoing = 0;
  t.mock.method(globalThis, "fetch", async () => {
    outgoing += 1;
    return Response.json(responseBody(path));
  });
  for (let i = 0; i < 30; i += 1) {
    const response = await endpoint.POST(input(path, body, {
      "X-Forwarded-For": "203.0.113.52",
    }));
    assert.equal(response.status, 200, "request " + (i + 1));
  }
  const limited = await endpoint.POST(input(path, body, {
    "X-Forwarded-For": "203.0.113.52",
  }));
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: "rate_limited" });
  assert.equal(outgoing, 30);
});
