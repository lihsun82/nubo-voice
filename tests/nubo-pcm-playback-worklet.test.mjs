import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

test("a PCM tail shorter than the startup buffer still plays and releases the mic", () => {
  const messages = [];
  let processor;
  class AudioWorkletProcessor {
    port = { postMessage: (message) => messages.push(message.type) };
  }
  runInNewContext(readFileSync(new URL("../public/nubo-pcm-playback-worklet.js", import.meta.url), "utf8"), {
    AudioWorkletProcessor,
    registerProcessor: (_name, constructor) => { processor = new constructor(); },
    Float32Array,
  });
  const push = (frames) => processor.port.onmessage({
    data: { type: "push", samples: new Float32Array(frames).fill(0.4) },
  });
  const render = (quanta) => {
    const output = new Float32Array(128);
    let played = false;
    for (let i = 0; i < quanta; i += 1) {
      processor.process([], [[output]]);
      played ||= output.some((sample) => sample > 0);
    }
    return played;
  };

  push(3_000);
  assert.equal(render(30), true);
  assert.equal(messages.at(-1), "drained");
  messages.length = 0;

  push(1_600);
  assert.equal(render(5), false, "absorb a short gap before resuming");
  assert.equal(render(32), true, "play the tail even when nothing follows");
  assert.deepEqual(messages, ["rebuffer", "drained"]);
});
