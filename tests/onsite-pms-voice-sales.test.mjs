import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyNuboArrivalIntent, isNuboAvailabilityOnlyQuestion } from "../lib/nubo-arrival-intent.ts";

const browserTool = readFileSync("lib/browser-nubo-tools-line.ts", "utf8");
const consoleSource = readFileSync("components/GeminiVoiceConsole.tsx", "utf8");
const partnerTool = readFileSync("lib/nubosci-voice-session.ts", "utf8");

test("asking about availability does not automatically send a LINE sales notice", () => {
  for (const message of [
    "請問今天還有雙人房嗎？",
    "今天入住還有房嗎",
    "請問現在可以入住嗎？",
    "請問可以訂房嗎？",
    "還有幾間空房可以入住？",
    "Can I book a room tonight?",
  ]) {
    assert.equal(isNuboAvailabilityOnlyQuestion(message), true, message);
    assert.equal(classifyNuboArrivalIntent(message), null, message);
  }
});

test("explicit booking/check-in intent still routes to the existing arrival channel", () => {
  const cases = [
    ["幫我訂房", "booking"],
    ["我要訂房", "booking"],
    ["我要辦理入住", "checkin"],
    ["我要住一晚", "lodging"],
    ["Please book a room", "booking"],
  ];
  for (const [message, expected] of cases) {
    assert.equal(classifyNuboArrivalIntent(message), expected, message);
  }
  assert.equal(classifyNuboArrivalIntent("取消訂房"), null);
});

test("main voice speaks only verified PMS room counts on explicit guest request", () => {
  assert.match(browserTool, /source=live/);
  assert.match(browserTool, /inventoryView=guest-room-types-v1/);
  assert.match(browserTool, /availableCount/);
  assert.match(browserTool, /旅客明確問「還有幾間」/);
  assert.match(browserTool, /先說「有／沒有符合需求的可售房型」/);
  assert.match(browserTool, /只檢查可售數量，不查已售房間或旅客個資/);
  assert.match(browserTool, /不可把不同房型任意加總/);
  assert.match(browserTool, /目前無法確認/);
  assert.doesNotMatch(browserTool, /即使被問到幾間也不報|不得報出剩餘間數|對客不報庫存數字/);
});

test("booking link only appears when same-request LIVE guest room type inventory is available", () => {
  assert.match(consoleSource, /result\.source === "live"/);
  assert.match(consoleSource, /result\.inventoryView === "guest-room-types-v1"/);
  assert.match(consoleSource, /result\.covered === true/);
  assert.match(consoleSource, /Number\.isInteger\(room\.availableCount\) && room\.availableCount > 0/);
  assert.match(browserTool, /bookingPageReady=false 時不得引導點擊不存在的訂房按鈕/);
});

test("sales handoff is confirmed only after a successful arrival notification", () => {
  assert.match(browserTool, /工具確認 sent=true 或 duplicate=true 時才說已通知/);
  assert.match(browserTool, /LINE 額度不足/);
  assert.match(browserTool, /單純詢問有沒有房不必通報/);
  assert.match(partnerTool, /本 nubosci 語音工具只有查詢權限/);
  assert.match(partnerTool, /不能說已通知、已保留、已付款或已建單/);
});

test("partner voice uses matching stay/rest inventory, never returns unknown as zero", () => {
  assert.match(partnerTool, /room_catalogue_incomplete、503、過期/);
  assert.match(partnerTool, /不與住宿庫存混用/);
  assert.match(partnerTool, /沒有有效 roomTypes 不得報零或客滿/);
  assert.match(partnerTool, /精確回答本次已確認的指定房型 availableCount/);
  assert.match(partnerTool, /不可把不同房型加總/);
  assert.match(partnerTool, /一種合適選項/);
});
