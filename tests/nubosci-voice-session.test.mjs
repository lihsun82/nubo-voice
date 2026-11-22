import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { createNubosciVoiceSessionHandler } from "../lib/nubosci-voice-session.ts";

const PATH = "https://voice.example.test/api/partners/nubosci/v1/voice-session";
const PARTNER_KEY = "mock-nubosci-partner-key-value-only-for-unit-tests";
const PARTNER_DIGEST = createHash("sha256").update(PARTNER_KEY).digest("hex");
const GEMINI_KEY = "mock-gemini-api-key";
const MODEL = "gemini-test-live";
const TOKEN = "auth_tokens/fixture-one-use";
const TIME = Date.parse("2026-11-16T02:00:00Z");
const SESSION_ID = "16f774c5-776c-4575-bc3c-6da311abe686";

function request(body = JSON.stringify({ sessionId: SESSION_ID }), headers = {}, url = PATH) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PARTNER_KEY}`,
      ...headers,
    },
    body,
  });
}

function setup(settings = {}) {
  const calls = [];
  let clock = TIME;
  const handle = createNubosciVoiceSessionHandler({
    partnerKeySha256: PARTNER_DIGEST,
    geminiApiKey: GEMINI_KEY,
    geminiModel: MODEL,
    now: () => clock,
    fetcher: async (...args) => {
      calls.push(args);
      return Response.json({ name: TOKEN });
    },
    ...settings,
  });
  return { calls, handle, advance: (milliseconds) => { clock += milliseconds; } };
}

test("requests a one-use Gemini grant with the full AUDIO setup locked", async () => {
  const { handle, calls } = setup({ geminiModel: `models/${MODEL}` });
  const result = await handle(request());
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(result.headers.has("access-control-allow-origin"), false);
  assert.deepEqual(await result.json(), {
    token: TOKEN,
    model: MODEL,
    startExpiresAt: "2026-11-16T02:01:00.000Z",
    expiresAt: "2026-11-16T02:05:00.000Z",
  });
  assert.equal(calls.length, 1);
  const [[url, options]] = calls;
  assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/auth_tokens");
  assert.equal(options.method, "POST");
  assert.equal(options.redirect, "error");
  assert.equal(options.cache, "no-store");
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(new Headers(options.headers).get("x-goog-api-key"), GEMINI_KEY);
  assert.equal(new Headers(options.headers).has("authorization"), false);
  const input = JSON.parse(options.body);
  assert.equal(input.uses, 1);
  assert.equal(input.newSessionExpireTime, "2026-11-16T02:01:00.000Z");
  assert.equal(input.expireTime, "2026-11-16T02:05:00.000Z");
  assert.deepEqual(Object.keys(input).sort(), [
    "bidiGenerateContentSetup", "expireTime", "newSessionExpireTime", "uses",
  ]);
  const optionsLocked = input.bidiGenerateContentSetup;
  assert.equal(optionsLocked.model, `models/${MODEL}`);
  assert.deepEqual(optionsLocked.generationConfig.responseModalities, ["AUDIO"]);
  assert.equal(optionsLocked.tools.length, 1);
  assert.equal(optionsLocked.tools[0].functionDeclarations.length, 1);
  const [tool] = optionsLocked.tools[0].functionDeclarations;
  assert.equal(tool.name, "open_reservation_lookup");
  assert.equal("parameters" in tool || "parametersJsonSchema" in tool, false);
  assert.equal("sessionResumption" in optionsLocked, false);
  assert.match(optionsLocked.systemInstruction.parts[0].text, /聯絡櫃檯/);
  assert.equal(options.body.includes(SESSION_ID), false);
});

test("puts only supplied PMS room rows into the locked voice instructions", async () => {
  const { handle, calls } = setup({
    availabilityProvider: async () => ({
      generatedAt: "2026-11-16T02:00:00Z",
      availability: [{
        checkIn: "2026-11-17",
        checkOut: "2026-11-18",
        adults: 2,
        roomTypes: [{ code: "DBL", name: "雙人房", availableCount: 3 }],
      }],
    }),
  });
  assert.equal((await handle(request())).status, 200);
  const instruction = JSON.parse(calls[0][1].body).bidiGenerateContentSetup.systemInstruction.parts[0].text;
  assert.match(instruction, /房況 JSON/);
  assert.match(instruction, /2026-11-17/);
  assert.match(instruction, /雙人房/);
  assert.ok(instruction.includes('"availableCount":3'));
  assert.match(instruction, /不能說已客滿/);
});

test("withholds unavailable PMS room data from the voice instructions", async () => {
  const { handle, calls } = setup({ availabilityProvider: async () => null });
  assert.equal((await handle(request())).status, 200);
  const instruction = JSON.parse(calls[0][1].body).bidiGenerateContentSetup.systemInstruction.parts[0].text;
  assert.match(instruction, /沒有可供語音核對的有效房況資料/);
  assert.doesNotMatch(instruction, /房況 JSON/);
});

test("declares stay and rest tools only when the nubosci client is ready", async () => {
  const { handle, calls } = setup({
    enablePmsTools: true,
    availabilityProvider: async () => { throw new Error("must not preload a snapshot"); },
  });
  assert.equal((await handle(request())).status, 200);
  const locked = JSON.parse(calls[0][1].body).bidiGenerateContentSetup;
  assert.deepEqual(locked.tools[0].functionDeclarations.map((item) => item.name), [
    "open_reservation_lookup", "pms_check_stay_availability", "pms_check_rest_availability",
  ]);
  const instruction = locked.systemInstruction.parts[0].text;
  assert.match(instruction, /room_catalogue_incomplete/);
  assert.match(instruction, /目前無法確認住宿房況，請洽櫃檯/);
  assert.match(instruction, /開始時間與休息時長/);
  assert.match(instruction, /明確問「剩幾間」/);
  assert.match(instruction, /只推薦一種/);
  assert.match(instruction, /拒絕的床型不再推薦/);
  assert.match(instruction, /availableCount/);
  assert.match(instruction, /引導至現場櫃檯完成訂房/);
  assert.match(instruction, /不可把不同房型加總/);
  assert.doesNotMatch(instruction, /即使被問到幾間也不報/);
  assert.doesNotMatch(instruction, /房況 JSON/);
});

test("fails closed when missing config, unauthorized, or called with browser origin", async () => {
  const cases = [
    [{ partnerKeySha256: undefined }, request(), 503],
    [{ partnerKeySha256: "invalid" }, request(), 503],
    [{ geminiApiKey: undefined }, request(), 503],
    [{ geminiModel: "https://example.test" }, request(), 503],
    [{}, request(undefined, { Authorization: "" }), 401],
    [{}, request(undefined, { Authorization: `Bearer ${"x".repeat(32)}` }), 401],
    [{}, request(undefined, { Origin: "https://nubosci.ainubohub.com" }), 403],
    [{}, new Request(PATH, { method: "OPTIONS" }), 405],
  ];
  for (const [settings, input, status] of cases) {
    const { handle, calls } = setup(settings);
    const result = await handle(input);
    assert.equal(result.status, status);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.equal(result.headers.has("access-control-allow-origin"), false);
    assert.equal(calls.length, 0);
  }
});

test("requires bounded JSON with a single UUID v4 field", async () => {
  const { handle, calls } = setup();
  const cases = [
    [request("[]"), 400],
    [request('{"sessionId":"invalid"}'), 400],
    [request(JSON.stringify({ sessionId: SESSION_ID, propertyId: "extra" })), 400],
    [request(" ".repeat(513)), 400],
    [request(undefined, { "Content-Length": "513" }), 400],
    [request(new Uint8Array([0xff])), 400],
    [request(undefined, {}, `${PATH}?extra=1`), 400],
    [request(undefined, { "Content-Type": "text/plain" }), 415],
    [request(undefined, { "Content-Encoding": "gzip" }), 415],
  ];
  for (const [input, status] of cases) {
    assert.equal((await handle(input)).status, status);
  }
  assert.equal(calls.length, 0);
});

test("refuses replays before and after provider response", async () => {
  let release;
  let seen;
  const started = new Promise((resolve) => { seen = resolve; });
  const { handle } = setup({
    fetcher: () => new Promise((resolve) => {
      release = resolve;
      seen();
    }),
  });
  const first = handle(request());
  await started;
  const duplicate = request(JSON.stringify({ sessionId: SESSION_ID.toUpperCase() }));
  assert.equal((await handle(duplicate)).status, 409);
  release(Response.json({ name: TOKEN }));
  assert.equal((await first).status, 200);
  assert.equal((await handle(request())).status, 409);
});

test("bounds hourly allocations without blocking a later window", async () => {
  const { handle, calls, advance } = setup();
  const freshRequest = () => request(JSON.stringify({ sessionId: randomUUID() }));
  for (let index = 0; index < 10; index += 1) {
    for (let count = 0; count < 12; count += 1) {
      assert.equal((await handle(freshRequest())).status, 200);
    }
    assert.equal((await handle(freshRequest())).status, 429);
    advance(60_000);
  }
  const limited = await handle(freshRequest());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "3600");
  assert.equal(calls.length, 120);
  advance(60 * 60_000);
  assert.equal((await handle(freshRequest())).status, 200);
  assert.equal(calls.length, 121);
});

test("rejects further allocations while three requests are in flight", async () => {
  const releases = [];
  let seen;
  const started = new Promise((resolve) => { seen = resolve; });
  const { handle } = setup({
    fetcher: () => new Promise((resolve) => {
      releases.push(resolve);
      if (releases.length === 3) seen();
    }),
  });
  const freshRequest = () => request(JSON.stringify({ sessionId: randomUUID() }));
  const pending = Array.from({ length: 3 }, () => handle(freshRequest()));
  await started;
  const limited = await handle(freshRequest());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "10");
  releases.forEach((release) => release(Response.json({ name: TOKEN })));
  const completed = await Promise.all(pending);
  assert.deepEqual(completed.map(({ status }) => status), [200, 200, 200]);
});

test("hides provider failure details and rejects unexpected token values", async () => {
  const cases = [
    () => Response.json({ error: { message: GEMINI_KEY } }, { status: 429 }),
    () => Response.json({ name: GEMINI_KEY }),
    () => new Response("non-JSON success"),
    () => { throw new Error(GEMINI_KEY); },
  ];
  for (const fetcher of cases) {
    const { handle } = setup({ fetcher });
    const result = await handle(request());
    assert.equal(result.status, 502);
    assert.deepEqual(await result.json(), { error: "voice_unavailable" });
  }
});

test("withholds a grant that cannot start before its expiry", async () => {
  let clock = TIME;
  const { handle } = setup({
    now: () => clock,
    fetcher: () => {
      clock += 60_000;
      return Response.json({ name: TOKEN });
    },
  });
  const result = await handle(request());
  assert.equal(result.status, 502);
  assert.deepEqual(await result.json(), { error: "voice_unavailable" });
});
