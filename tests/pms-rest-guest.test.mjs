import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const token = "test-pms-read-token-that-is-long-enough";
const url = "https://pms.example.test/api/voice/v1/rest-availability";
const propertyId = "ainubo-taichung-jinxin";
const route = require("../.next/server/app/api/pms/v1/rest-availability/route.js").routeModule.userland;

function request(body) {
  const input = new Request("https://nubo.ainubo.com/api/pms/v1/rest-availability", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  input.cookies = new Map();
  return input;
}

test("NUBO guest voice queries live rest inventory and keeps failures distinct from zero", async (t) => {
  process.env.NUBO_PMS_PUSH_TOKEN = token;
  process.env.NUBO_PMS_AVAILABILITY_TOKEN = token;
  process.env.NUBO_PMS_REST_AVAILABILITY_URL = url;

  const query = { startAt: "now", durationMinutes: 120 };
  let sent;
  t.mock.method(globalThis, "fetch", async (target, options) => {
    sent = { target, options };
    return Response.json({
      propertyId, startAt: new Date().toISOString(), durationMinutes: 120,
      asOf: new Date().toISOString(), availableCount: 7,
    });
  });
  const success = await route.POST(request(query));
  assert.equal(success.status, 200);
  assert.equal(success.headers.get("cache-control"), "no-store");
  assert.equal((await success.json()).availableCount, 7);
  assert.equal(sent.target, url);
  assert.deepEqual(JSON.parse(sent.options.body), { propertyId, ...query });
  assert.equal(sent.options.headers.Authorization, `Bearer ${token}`);

  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => Response.json({
    propertyId, startAt: new Date().toISOString(), durationMinutes: 120,
    asOf: new Date().toISOString(), availableCount: 0,
  }));
  assert.equal((await (await route.POST(request(query))).json()).availableCount, 0);

  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 503 }));
  const unavailable = await route.POST(request(query));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "pms_data_unavailable" });

  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => { throw new Error("invalid query reached PMS"); });
  assert.equal((await route.POST(request({ startAt: "now", durationMinutes: 30 }))).status, 400);
});

test("rejected cross-midnight intervals are distinguished from confirmed zero inventory", async t => {
  process.env.NUBO_PMS_PUSH_TOKEN = token;
  process.env.NUBO_PMS_AVAILABILITY_TOKEN = token;
  process.env.NUBO_PMS_REST_AVAILABILITY_URL = url;
  t.mock.method(globalThis, "fetch", async () => Response.json({error: "invalid_query"}, {status: 400}));
  const date = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0,10);
  for (const [hour, crossesMidnight] of [["23",true],["10",false]]) {
    const result = await route.POST(request({startAt: date + "T" + hour + ":00:00+08:00", durationMinutes:180}));
    assert.equal(result.status,502);
    assert.deepEqual(await result.json(), {error:"pms_upstream_query_rejected", crossesMidnight});
  }
});
