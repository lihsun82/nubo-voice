import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createNubosciPmsQueryHandler } from "../lib/nubosci-pms-query.ts";
import { queryLivePmsRestAvailability } from "../lib/pms-live-rest-availability.ts";

const PROPERTY = "ainubo-taichung-jinxin";
const PARTNER_KEY = "mock-nubosci-partner-key-value-only-for-unit-tests";
const PMS_KEY = "mock-pms-read-only-token-value-for-unit-tests";
const STAY_URL = "https://pms.example.test/api/voice/v1/availability";
const REST_URL = "https://pms.example.test/api/voice/v1/rest-availability";
const CHECK_IN = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
const CHECK_OUT = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
const STAY = { propertyId: PROPERTY, checkIn: CHECK_IN, checkOut: CHECK_OUT, adults: 2 };
const REST_START = `${CHECK_IN}T10:00:00+08:00`;

function request(kind, body, headers = {}) {
  return new Request(`https://nubo.example.test/api/partners/nubosci/v1/${kind}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PARTNER_KEY}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function withConfig(fn) {
  const saved = {
    digest: process.env.NUBOSCI_VOICE_PARTNER_KEY_SHA256,
    pms: process.env.NUBO_PMS_AVAILABILITY_TOKEN,
    stay: process.env.NUBO_PMS_AVAILABILITY_URL,
    rest: process.env.NUBO_PMS_REST_AVAILABILITY_URL,
    fetch: globalThis.fetch,
  };
  process.env.NUBOSCI_VOICE_PARTNER_KEY_SHA256 = createHash("sha256").update(PARTNER_KEY).digest("hex");
  process.env.NUBO_PMS_AVAILABILITY_TOKEN = PMS_KEY;
  process.env.NUBO_PMS_AVAILABILITY_URL = STAY_URL;
  process.env.NUBO_PMS_REST_AVAILABILITY_URL = REST_URL;
  return Promise.resolve().then(fn).finally(() => {
    for (const [key, value] of [
      ["NUBOSCI_VOICE_PARTNER_KEY_SHA256", saved.digest],
      ["NUBO_PMS_AVAILABILITY_TOKEN", saved.pms],
      ["NUBO_PMS_AVAILABILITY_URL", saved.stay],
      ["NUBO_PMS_REST_AVAILABILITY_URL", saved.rest],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    globalThis.fetch = saved.fetch;
  });
}

test("stay proxy sends only exact PMS fields and returns a fresh room count", () => withConfig(async () => {
  let sent;
  globalThis.fetch = async (url, options) => {
    sent = { url, options };
    return Response.json({ ...STAY, asOf: new Date().toISOString(), roomTypes: [
      { code: "DOUBLE", name: "雙人房", availableCount: 2 },
    ] });
  };
  const result = await createNubosciPmsQueryHandler("stay")(
    request("availability", STAY));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(sent.url, STAY_URL);
  assert.equal(sent.options.method, "POST");
  assert.equal(sent.options.headers.Authorization, `Bearer ${PMS_KEY}`);
  assert.deepEqual(JSON.parse(sent.options.body), STAY);
  assert.equal((await result.json()).roomTypes[0].availableCount, 2);
}));

test("catalogue incomplete and stale data never become zero rooms", () => withConfig(async () => {
  const handle = createNubosciPmsQueryHandler("stay");
  globalThis.fetch = async () => Response.json(
    { error: "pms_data_unavailable", reason: "room_catalogue_incomplete" },
    { status: 503 });
  const unavailable = await handle(request("availability", STAY));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error: "pms_data_unavailable", reason: "room_catalogue_incomplete",
  });
  globalThis.fetch = async () => Response.json({
    ...STAY, asOf: new Date(Date.now() - 6 * 60_000).toISOString(), roomTypes: [],
  });
  const stale = await handle(request("availability", STAY));
  assert.equal(stale.status, 503);
  assert.deepEqual(await stale.json(), { error: "pms_data_unavailable" });
}));

test("rest proxy verifies the requested interval, count and freshness", () => withConfig(async () => {
  let sent;
  const fetcher = async (url, options) => {
    sent = { url, options };
    return Response.json({
      propertyId: PROPERTY,
      startAt: REST_START,
      durationMinutes: 120,
      asOf: new Date().toISOString(),
      availableCount: 7,
    });
  };
  const result = await queryLivePmsRestAvailability(
    REST_START, 120, fetcher);
  assert.equal(sent.url, REST_URL);
  assert.equal(sent.options.cache, "no-store");
  assert.equal(sent.options.headers.Authorization, `Bearer ${PMS_KEY}`);
  assert.deepEqual(JSON.parse(sent.options.body), {
    propertyId: PROPERTY, startAt: REST_START, durationMinutes: 120,
  });
  assert.equal(result.availableCount, 7);
  await assert.rejects(() => queryLivePmsRestAvailability(
    REST_START, 120,
    async () => Response.json({ ...result, availableCount: -1 })), /pms_data_unavailable/);
  await assert.rejects(() => queryLivePmsRestAvailability(
    REST_START, 120,
    async () => Response.json({ ...result, asOf: new Date(Date.now() - 6 * 60_000).toISOString() })), /pms_data_unavailable/);
}));

test("rest proxy reports confirmed zero separately from an upstream failure", () => withConfig(async () => {
  const handle = createNubosciPmsQueryHandler("rest");
  globalThis.fetch = async () => Response.json({
    propertyId: PROPERTY, startAt: new Date().toISOString(), durationMinutes: 120,
    asOf: new Date().toISOString(), availableCount: 0,
  });
  const zero = await handle(request("rest-availability", {
    propertyId: PROPERTY, startAt: "now", durationMinutes: 120,
  }));
  assert.equal(zero.status, 200);
  assert.equal((await zero.json()).availableCount, 0);
  globalThis.fetch = async () => Response.json({ error: "pms_data_unavailable" }, { status: 503 });
  const failed = await handle(request("rest-availability", {
    propertyId: PROPERTY, startAt: "now", durationMinutes: 120,
  }));
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "pms_data_unavailable" });
}));

test("partner proxy rejects browser origins and invalid queries before contacting PMS", () => withConfig(async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("must not call PMS"); };
  const handle = createNubosciPmsQueryHandler("rest");
  const cases = [
    [request("rest-availability", { propertyId: "other", startAt: "now", durationMinutes: 120 }), 400],
    [request("rest-availability", { propertyId: PROPERTY, startAt: "now", durationMinutes: 59 }), 400],
    [request("rest-availability", { propertyId: PROPERTY, startAt: "now", durationMinutes: 120 }, { Origin: "https://nubosci.ainubohub.com" }), 401],
    [request("rest-availability", { propertyId: PROPERTY, startAt: "now", durationMinutes: 120 }, { Authorization: "Bearer invalid" }), 401],
  ];
  for (const [input, expected] of cases) {
    const result = await handle(input);
    assert.equal(result.status, expected);
    assert.equal(result.headers.has("access-control-allow-origin"), false);
  }
  assert.equal(calls, 0);
}));
