import assert from "node:assert/strict";
import test from "node:test";
import {
  NUBO_KIOSK_MANDARIN_GREETING,
  NUBO_KIOSK_GREETING_PROMPTS,
  checkNuboEnglishReply,
  detectNuboGuestReplyLanguage,
  detectNuboGuestSpeechLanguage,
  getNuboGuestSpeechLanguage,
  reportNuboKioskSpeech,
  resetNuboKioskLanguage,
  selectNuboKioskLanguage,
} from "../lib/nubo-kiosk-language.ts";
import { formatNuboGuestLanguage } from "../lib/nubo-guest-language.ts";

test("the Mandarin welcome uses the hotel's approved wording and bypasses model generation", () => {
  assert.equal(NUBO_KIOSK_MANDARIN_GREETING, "Hello歡迎新寶智慧酒店，我是你的智慧管家NUBO");
  assert.equal(Object.hasOwn(NUBO_KIOSK_GREETING_PROMPTS, "zh"), false);
});

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

test("staff notification language follows the actual speaker, independently of the greeting selection", () => {
  resetNuboKioskLanguage();
  selectNuboKioskLanguage("ja");
  assert.equal(getNuboGuestSpeechLanguage(), null);
  reportNuboKioskSpeech("호텔에 체크인하고 싶어요.", "kor");
  assert.equal(formatNuboGuestLanguage(getNuboGuestSpeechLanguage()), "韓文");
  reportNuboKioskSpeech("日文也可以嗎？");
  assert.equal(formatNuboGuestLanguage(getNuboGuestSpeechLanguage()), "中文");
  assert.equal(detectNuboGuestSpeechLanguage("請用日文回答"), "zh");
  assert.equal(detectNuboGuestSpeechLanguage("我欲歇睏三點鐘。", "zh-TW"), "nan");
  resetNuboKioskLanguage();
  assert.equal(getNuboGuestSpeechLanguage(), null);
});

test("staff labels accept language aliases and reject arbitrary text", () => {
  assert.equal(formatNuboGuestLanguage("jpn-JP"), "日文");
  assert.equal(formatNuboGuestLanguage("vi_VN"), "越南文");
  assert.equal(formatNuboGuestLanguage("fr-FR"), "法文");
  assert.equal(formatNuboGuestLanguage("ja\n任意訊息"), "未辨識");
});

test("the latest clear speech or explicit request selects the spoken reply language", () => {
  assert.equal(detectNuboGuestReplyLanguage("我欲歇睏三點鐘。", "cmn"), "nan");
  assert.equal(detectNuboGuestReplyLanguage("Could I book a room for tonight?", "zh-TW"), "en");
  assert.equal(detectNuboGuestReplyLanguage("English, please."), "en");
  assert.equal(detectNuboGuestReplyLanguage("您好，請用英文回答。請問有早餐嗎？", "zh"), "en");
  assert.equal(detectNuboGuestReplyLanguage("你可以講台語嗎？"), "nan");
  assert.equal(detectNuboGuestReplyLanguage("請問幾點退房？"), "zh");
});

test("English playback waits for clear words and rejects Mandarin and Taiwanese output", () => {
  assert.equal(checkNuboEnglishReply("Sure,", false), "waiting");
  assert.equal(checkNuboEnglishReply("This hotel does ", false), "match");
  assert.equal(checkNuboEnglishReply("Yes.", true), "match");
  assert.equal(checkNuboEnglishReply("我來共你查一下。", true), "mismatch");
  assert.equal(checkNuboEnglishReply("Okay, 我幫您查一下。", false), "mismatch");
  assert.equal(checkNuboEnglishReply("我先幫您查一下。", true), "mismatch");
  assert.equal(checkNuboEnglishReply("", true), "waiting");
});
