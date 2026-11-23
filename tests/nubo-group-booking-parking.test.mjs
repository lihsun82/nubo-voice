import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildNuboGroupBookingGuidance,
  isGroupOccupancy,
  NUBO_ADVERTISED_MAX_ROOM_GUESTS,
} from "../lib/nubo-group-booking.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("40 adults, 5 children and 1 tour bus route to manual group enquiry", () => {
  const result = buildNuboGroupBookingGuidance({ adults: 40, children: 5, coachCount: 1 });
  assert.equal(result.adults, 40);
  assert.equal(result.children, 5);
  assert.equal(result.coachCount, 1);
  assert.equal(result.flow, "manual_group_quote");
  assert.equal(result.inventoryConfirmed, false);
  assert.equal(result.bookingConfirmed, false);
  assert.equal(result.priceConfirmed, false);
  assert.equal(result.notifiedStaff, false);
  assert.equal(result.parking.coachParkingConfirmed, false);
  assert.match(result.speechText, /40位大人/);
  assert.match(result.speechText, /5位小孩/);
  assert.match(result.speechText, /遊覽車能否停放要另外確認/);
  assert.match(result.nextQuestion, /哪天入住/);
});

test("group classification uses per-room advertised capacity, not PMS 20-person limit", () => {
  assert.equal(NUBO_ADVERTISED_MAX_ROOM_GUESTS, 4);
  assert.equal(isGroupOccupancy(40, 5), true);
  assert.equal(isGroupOccupancy(21, 0), true);
  assert.equal(isGroupOccupancy(5, 0), true);
  assert.equal(isGroupOccupancy(4, 1), true);
  assert.equal(isGroupOccupancy(2, 0), false);
});

test("required group details gathered in stages, not invented", () => {
  const step = buildNuboGroupBookingGuidance({
    adults: 40, children: 5, coachCount: 1, checkIn: "2026-12-05", nights: 2,
  });
  assert.equal(step.checkIn, "2026-12-05");
  assert.equal(step.nights, 2);
  assert.match(step.nextQuestion, /小朋友各幾歲/);
  assert.ok(step.missing.includes("每位小孩的年齡"));
  const adultsOnly = buildNuboGroupBookingGuidance({
    adults: 6, children: 0, checkIn: "2026-12-05", checkOut: "2026-12-07",
  });
  assert.match(adultsOnly.nextQuestion, /雙人房/);
  assert.equal(adultsOnly.missing.includes("每位小孩的年齡"), false);
});

test("invalid group date and placeholder child ages never become confirmed bookings", () => {
  const r = buildNuboGroupBookingGuidance({
    adults: 40, children: 5, checkIn: "2026-02-30", checkOut: "2026-12-07",
    childAges: [6, 7],
  });
  assert.equal(r.checkIn, null);
  assert.equal(r.bookingConfirmed, false);
  assert.equal(r.inventoryConfirmed, false);
  assert.ok(r.missing.includes("每位小孩的年齡"));
});

test("voice tool routes invalid large group away from PMS POST and offers safe 400 fallback", () => {
  const source = read("../lib/browser-nubo-tools-line.ts");
  const reference = read("../lib/nubo-jinxin-reference.ts");
  const profile = read("../lib/nubo-voice-profile.ts");
  assert.match(source, /name: "pms_group_inquiry"/);
  assert.match(source, /isGroupOccupancy\(call\.args\?\.adults, call\.args\?\.children\)/);
  assert.ok(source.indexOf("isGroupOccupancy(call.args?.adults") < source.indexOf("const response = await fetch(route"));
  assert.match(source, /response\.status === 400/);
  assert.match(source, /並不代表房間售完/);
  assert.match(reference, /台安醫院旁的特約停車場/);
  assert.match(reference, /是否可停遊覽車/);
  assert.match(profile, /台安醫院旁特約停車場/);
  assert.match(source, /40位大人、5位小孩/);
});
