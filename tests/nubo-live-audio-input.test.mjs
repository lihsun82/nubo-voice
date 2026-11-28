import assert from "node:assert/strict";
import test from "node:test";
import { NuboLiveAudioInput } from "../lib/nubo-live-audio-input.ts";

function capture(t) {
  let now = 0;
  const commands = [];
  t.mock.method(performance, "now", () => now);
  const input = new NuboLiveAudioInput((pcm) => commands.push(pcm), () => commands.push("end"));
  const frame = (pcm, possibleSpeech = false, elapsedMs = 20) => {
    now += elapsedMs;
    input.write(pcm, possibleSpeech);
  };
  return { input, commands, frame };
}

test("a cloud turn with sustained captured silence gets one end signal and resumes with preroll", (t) => {
  const { input, commands, frame } = capture(t);

  input.startCloudActivity();
  frame("first words", true);
  for (let i = 0; i < 27; i++) frame("brief pause");
  assert.equal(commands.includes("end"), false);
  frame("rest of sentence", true);
  for (let i = 0; i < 47; i++) frame("quiet");
  assert.equal(commands.includes("end"), false);
  frame("quiet");
  assert.equal(commands.at(-1), "end");
  assert.ok(input.endCloudActivity() !== null);

  for (let i = 0; i < 20; i++) frame(`quiet-${i}`);
  assert.equal(commands.at(-1), "end", "silence does not reopen the stream");
  frame("next words", true);
  assert.deepEqual(commands.slice(-13), [
    ...Array.from({ length: 12 }, (_, i) => `quiet-${i + 8}`),
    "next words",
  ]);
  assert.equal(commands.filter((value) => value === "end").length, 1);
});

test("ordinary server turn endings and silent rooms do not get a local end marker", (t) => {
  const { input, commands, frame } = capture(t);
  input.startCloudActivity();
  for (let i = 0; i < 100; i++) frame("background");
  assert.equal(commands.includes("end"), false);
  frame("guest", true);
  for (let i = 0; i < 20; i++) frame("quiet");
  input.endCloudActivity();
  for (let i = 0; i < 100; i++) frame("quiet");
  assert.equal(commands.includes("end"), false);
});

test("bursty capture uses elapsed silence and a capture stall restarts the wait", (t) => {
  const { input, commands, frame } = capture(t);
  input.startCloudActivity();
  frame("guest", true);
  frame("quiet", false, 600);
  frame("first frame after a stall", false, 2_000);
  assert.equal(commands.includes("end"), false);
  for (let i = 0; i < 13; i++) {
    frame("quiet", false, 70);
    frame("quiet", false, 0);
  }
  assert.equal(commands.includes("end"), false);
  frame("quiet", false, 70);
  assert.equal(commands.at(-1), "end");
});
