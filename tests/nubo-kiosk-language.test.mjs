import assert from "node:assert/strict";
import test from "node:test";
import {
  reportNuboKioskSpeech,
  resetNuboKioskLanguage,
  selectNuboKioskLanguage,
} from "../lib/nubo-kiosk-language.ts";

test("Japanese speech takes over a manually selected welcome language", () => {
  resetNuboKioskLanguage();
  selectNuboKioskLanguage("zh");
  assert.equal(reportNuboKioskSpeech("はい。", "zh-TW"), true);
  assert.equal(reportNuboKioskSpeech("受付"), false);
  assert.equal(reportNuboKioskSpeech("房價"), true);
});

test("explicit speech requests change the visible language without waiting for another utterance", () => {
  resetNuboKioskLanguage();
  assert.equal(reportNuboKioskSpeech("请用日语回答。"), true);
  assert.equal(reportNuboKioskSpeech("日本語でお願いします。"), false);
  assert.equal(reportNuboKioskSpeech("Could you reply in Vietnamese?"), true);
  assert.equal(reportNuboKioskSpeech("Cảm ơn."), false);
  assert.equal(reportNuboKioskSpeech("LINE"), false);
});

test("locale metadata recognizes Japanese even when the transcript is romanized", () => {
  resetNuboKioskLanguage();
  assert.equal(reportNuboKioskSpeech("onamae?", "jpn"), true);
  assert.equal(reportNuboKioskSpeech("電話番号"), false);
  assert.equal(reportNuboKioskSpeech("How much is a room?"), true);
});
