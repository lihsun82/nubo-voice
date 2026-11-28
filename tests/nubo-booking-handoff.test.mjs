import test from "node:test";
import assert from "node:assert/strict";
import { GuestBookingHandoff, GUEST_KIOSK_URL, availableBookingOffers } from "../lib/nubo-booking-handoff.ts";

const dates = {checkIn: "2026-12-04", checkOut: "2026-12-07", adults: 2};
const rest = {startAt: "now", durationMinutes: 180};
const query = () => ({ covered: true, source: "live", inventoryView: "guest-room-types-v1",
  asOf: new Date().toISOString(), roomTypes: [
    {code: "CD", name: "智享雙人房", availableCount: 3}, {code: "PS", name: "智選單人房", availableCount: 0},
    {code: "P1", name: "其他雙人房", availableCount: 1},
  ]});
const start = (allowed = true) => {
  const opens = [], visible = [];
  const call = new GuestBookingHandoff(url => { opens.push(url); return allowed; }, (url, blocked) => visible.push([url,blocked]));
  return { call, opens, visible };
};
const select = (call, roomCode = "CD", url = null) => call.request({purpose: "stay", roomCode}, url);

test("per-room total uses each stay night and only available room types", () => {
  assert.deepEqual(availableBookingOffers("stay", dates, query()), [
    {roomCode: "CD", roomName: "智享雙人房", referenceTwd: 7040}, {roomCode: "P1", roomName: "其他雙人房", referenceTwd: null},
  ]);
});
test("rest rates use the returned interval; missing live or required floor scope cannot authorize handoff", () => {
  const result = {...query(), startAt: new Date().toISOString(), durationMinutes: 180};
  assert.equal(availableBookingOffers("rest", rest, result)[0].referenceTwd, 890);
  assert.equal(availableBookingOffers("rest", {...rest,durationMinutes:120}, {...result,durationMinutes:120})[0].referenceTwd, null);
  assert.deepEqual(availableBookingOffers("rest", rest, {...result,durationMinutes:120}), []);
  assert.deepEqual(availableBookingOffers("stay", {...dates,requiredAmenities:["bathtub"]},query()), []);
  assert.deepEqual(availableBookingOffers("stay", dates,{...query(),source:"snapshot"}), []);
  assert.deepEqual(availableBookingOffers("stay", dates,{...query(),asOf:"2025-01-01T00:00:00Z"}), []);
});
test("new booking waits for live stock, voiced quote, turn completion and playback drain, once per call", () => {
  const {call, opens} = start();
  assert.equal(select(call).ok,false);
  call.inventory(call.invalidate(),"stay",dates,query());
  assert.equal(select(call,"PS").ok,false);
  assert.equal(select(call).destination,"self_service_kiosk");
  call.endReply(); assert.deepEqual(opens,[]);
  call.playback(true); call.replyTranscript("智享雙人房三晚參考價七千零四十元"); call.spoken(); call.endReply(); assert.deepEqual(opens,[]);
  call.playback(false); assert.deepEqual(opens,[GUEST_KIOSK_URL]);
  select(call); call.spoken(); call.endReply(); assert.equal(opens.length,1);
});
test("OTA uses original guest kiosk, and stale or interrupted shopping cannot launch later", () => {
  const {call,opens} = start();
  const oldRevision=call.invalidate();
  call.inventory(call.invalidate(),"stay",dates,{...query(),roomTypes:[]});
  assert.equal(call.inventory(oldRevision,"stay",dates,query()).ok,false);
  assert.equal(select(call).ok,false);
  call.inventory(call.invalidate(),"stay",dates,query());
  select(call,"CD","https://hotel.example/book"); call.interrupt(); call.spoken(); call.endReply();
  assert.deepEqual(opens,[]);
  call.request({purpose:"existing"},"https://hotel.example/book");
  assert.deepEqual(opens,[GUEST_KIOSK_URL]);
  assert.equal(select(call).ok,false);
});
test("short stay, blocked tabs, manual opening and restarting a call", () => {
  const {call,opens,visible} = start(false);
  call.inventory(call.invalidate(),"rest",rest,{...query(),startAt:new Date().toISOString(),durationMinutes:180});
  assert.equal(call.request({purpose:"rest",roomCode:"CD"},"https://hotel.example/book").destination,"self_service_kiosk");
  call.replyTranscript("三小時八百九十元"); call.spoken(); call.endReply();
  assert.deepEqual(visible.at(-1),[GUEST_KIOSK_URL,true]);
  call.request({purpose:"existing"}, null); assert.equal(opens.length,1);
  const url = "https://hotel.example/book";
  call.reset(); call.inventory(call.invalidate(),"stay",dates,query(),url);
  assert.equal(select(call,"CD",url).destination,"hotel_booking_page");
  call.manual(url); call.spoken(); call.endReply();
  assert.equal(opens.length,1);
  call.reset(); call.request({purpose:"existing"},null); assert.equal(opens.length,2);
});

test("ordinary PMS lookup opens after a spoken quote even if the voice model skips the navigation tool", () => {
  const {call,opens} = start();
  const result = call.inventory(call.invalidate(),"stay",dates,query());
  assert.equal(result.handoff,"after_spoken_quote");
  call.replyTranscript("馬上為您確認"); call.spoken(); call.endReply(); assert.equal(opens.length,0);
  call.playback(true); call.replyTranscript("智享雙人房三晚合計參考價七千零四十元。");
  call.spoken(); call.endReply(); call.playback(false);
  assert.deepEqual(opens,[GUEST_KIOSK_URL]);
});

test("explicit price-only, blocked navigation and in-page requests stay on the current page", () => {
  for (const phrase of ["我只想問價", "我已經在自助頁", "please don't open the page", "料金だけ"]) {
    const {call,opens} = start();
    call.guestTurn(); call.guestTranscript(phrase);
    assert.equal(call.inventory(call.invalidate(),"stay",dates,query()).handoff,"none");
    assert.equal(select(call).ok,false);
    call.replyTranscript("智享雙人房 7040 元"); call.spoken(); call.endReply();
    assert.equal(opens.length,0);
  }
  const {call} = start();
  assert.equal(call.inventory(call.invalidate(),"stay",{...dates,navigation:"information_only"},query()).handoff,"none");
});

test("an existing OTA guest hears the original-order step and opens the kiosk even without a model tool call", () => {
  for (const [words, shouldOpen] of [
    ["我已經在 Agoda 訂好也付清了，現在到飯店了", true],
    ["I already booked on Agoda; how do I check in?", true],
    ["我在自助頁，已經在 Agoda 訂好了", false],
    ["我還沒在 Agoda 訂好", false], ["如果我已經在 Agoda 訂好了呢", false],
  ]) {
    const {call,opens} = start();
    call.guestTurn(); call.guestTranscript(words);
    assert.deepEqual(opens,[]);
    call.playback(true); call.replyTranscript("在機台選擇掃描入住 QR Code。");
    call.spoken(); call.endReply(); call.playback(false);
    assert.equal(opens.length, Number(shouldOpen),words);
  }
});

test("explicit self-service commands open the kiosk without a PMS lookup and the model sees the same result", () => {
  for (const words of ["幫我打開自助頁", "可以直接開啟 nubosci.ainubohub.com 分頁", "請直接開啟訂房網頁。", "Open the booking page!", "予約ページを開いてください", "예약 페이지를 열어 주세요", "Mở trang đặt phòng"]) {
    const { call, opens } = start();
    call.guestTurn(); call.guestTranscript(words);
    assert.equal(opens.length, 0);
    call.finishGuestSpeech(); call.finishGuestSpeech();
    assert.deepEqual(opens,[GUEST_KIOSK_URL],words);
    assert.equal(call.request({purpose:"open_page"},"https://hotel.example/book").pageStatus,"opened");
    assert.equal(opens.length,1);
  }
});
test("information or a cancelled speech request stays put, and a popup block is reported accurately", () => {
  for (const words of ["訂房頁怎麼開？", "不用幫我打開自助頁", "我要訂房", "我已經在自助頁了"]) {
    const {call,opens} = start(); call.guestTurn(); call.guestTranscript(words); call.finishGuestSpeech();
    assert.deepEqual(opens,[],words);
  }
  const {call,opens,visible} = start(false);
  call.guestTurn(); call.guestTranscript("幫我打開自助頁"); call.guestTranscript("，等等，不用了。"); call.finishGuestSpeech();
  assert.equal(opens.length,0);
  call.guestTurn(); assert.equal(call.request({purpose:"open_page"},null).pageStatus,"blocked");
  assert.deepEqual(visible.at(-1),[GUEST_KIOSK_URL,true]);
  assert.equal(call.request({purpose:"open_page"},null).pageStatus,"blocked"); assert.equal(opens.length,1);
});
