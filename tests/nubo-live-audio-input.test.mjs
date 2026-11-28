import assert from "node:assert/strict";
import test from "node:test";
import { NuboLiveAudioInput } from "../lib/nubo-live-audio-input.ts";

test("a cloud turn with sustained captured silence gets one end signal and resumes with preroll", () => {
  const commands = [];
  const input = new NuboLiveAudioInput((pcm) => commands.push(pcm), () => commands.push("end"));

  input.startCloudActivity();
  input.write("first words", true, 20);
  for (let i = 0; i < 27; i++) input.write("brief pause", false, 20);
  assert.equal(commands.includes("end"), false);
  input.write("rest of sentence", true, 20);
  for (let i = 0; i < 47; i++) input.write("quiet", false, 20);
  assert.equal(commands.includes("end"), false);
  input.write("quiet", false, 20);
  assert.equal(commands.at(-1), "end");
  assert.ok(input.endCloudActivity() !== null);

  for (let i = 0; i < 20; i++) input.write(`quiet-${i}`, false, 20);
  assert.equal(commands.at(-1), "end", "silence does not reopen the stream");
  input.write("next words", true, 20);
  assert.deepEqual(commands.slice(-13), [
    ...Array.from({ length: 12 }, (_, i) => `quiet-${i + 8}`),
    "next words",
  ]);
  assert.equal(commands.filter((value) => value === "end").length, 1);
});

test("ordinary server turn endings and silent rooms do not get a local end marker", () => {
  let ends = 0;
  const input = new NuboLiveAudioInput(() => {}, () => { ends++; });
  input.startCloudActivity();
  for (let i = 0; i < 100; i++) input.write("background", false, 20);
  assert.equal(ends, 0);
  input.write("guest", true, 20);
  for (let i = 0; i < 20; i++) input.write("quiet", false, 20);
  input.endCloudActivity();
  for (let i = 0; i < 100; i++) input.write("quiet", false, 20);
  assert.equal(ends, 0);
});
