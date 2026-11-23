import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const text = readFileSync(new URL("../lib/nubo-jinxin-reference.ts", import.meta.url), "utf8");
const gemini = readFileSync(new URL("../lib/browser-nubo-tools-line.ts", import.meta.url), "utf8");
const openai = readFileSync(new URL("../lib/nubo-voice-profile.ts", import.meta.url), "utf8");

test("Jinxin hotel contact fields match owner-confirmed values", () => {
  assert.match(text, /address: "台中市北區錦新街18號"/);
  assert.match(text, /phone: "04-22231157"/);
  assert.match(text, /email: "hello@ainubohotels.com"/);
  assert.match(text, /旅客詢問「飯店在哪裡」/);
  assert.match(text, /不可宣稱已撥通電話/);
});

test("Both Gemini Live and OpenAI Realtime have shared contact reference", () => {
  assert.match(gemini, /\$\{NUBO_JINXIN_REFERENCE\}/);
  assert.match(openai, /\$\{NUBO_JINXIN_REFERENCE\}/);
});
