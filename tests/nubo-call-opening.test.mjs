import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { NuboCallOpening } from "../lib/nubo-call-tones.ts";

test("the selected welcome follows the ring on the same speaker and hang-up stops it", async (t) => {
  const sources = [];
  const speaker = {};
  let contexts = 0;
  class AudioOutput {
    state = "running";
    destination = speaker;
    constructor() { contexts++; }
    async resume() {}
    async close() { this.state = "closed"; }
    createBufferSource() {
      const source = {
        connect(to) { assert.equal(to, speaker); },
        disconnect() {},
        start() { sources.push(this); },
        stop() { this.stopped = true; },
      };
      return source;
    }
  }
  const globals = {
    AudioContext: AudioOutput,
    Audio: class {},
    OfflineAudioContext: class { async decodeAudioData(data) { return new TextDecoder().decode(data); } },
    fetch: async (url) => new Response(url),
    window: globalThis,
  };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }

  const opening = new NuboCallOpening("ja");
  await setImmediate();
  assert.equal(sources.length, 1);
  assert.match(sources[0].buffer, /nubo-guest-call-ring/);
  sources[0].onended();
  await opening.ring;
  const welcome = opening.playGreeting();
  await setImmediate();
  assert.equal(contexts, 1);
  assert.equal(sources.length, 2);
  assert.match(sources[1].buffer, /jinxin-welcome-ja/);
  opening.close();
  await welcome;
  assert.equal(sources[1].stopped, true);
});
