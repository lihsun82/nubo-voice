import assert from "node:assert/strict";
import test from "node:test";
import { getNuboClockSnapshot } from "../lib/nubo-clock.ts";

test("Taipei calendar correct at 2026-11-23 23:30 even though UTC date is 23", () => {
  const clock = getNuboClockSnapshot("Asia/Taipei", new Date("2026-11-23T15:30:00.000Z"));
  assert.equal(clock.localDate, "2026-11-23");
  assert.equal(clock.localIso, "2026-11-23T23:30:00+08:00");
  assert.equal(clock.weekday, "星期一");
  assert.deepEqual(clock.tomorrow, { date: "2026-11-24", weekday: "星期二", weekdayIndex: 2 });
});

test("Taiwan midnight rollover differs from UTC date", () => {
  const before = getNuboClockSnapshot("Asia/Taipei", new Date("2026-11-23T15:59:59Z"));
  const after = getNuboClockSnapshot("Asia/Taipei", new Date("2026-11-23T16:00:01Z"));
  assert.equal(before.localDate, "2026-11-23");
  assert.equal(after.localDate, "2026-11-24");
  assert.equal(after.isoUtc.slice(0,10), "2026-11-23");
  assert.equal(after.today.weekday, "星期二");
});

test("weekend and new year rollover", () => {
  const weekend = getNuboClockSnapshot("Asia/Taipei", new Date("2026-11-21T16:00:00Z"));
  assert.equal(weekend.today.date, "2026-11-22");
  assert.equal(weekend.today.weekday, "星期日");
  assert.equal(weekend.tomorrow.weekday, "星期一");
  const year = getNuboClockSnapshot("Asia/Taipei", new Date("2026-12-31T16:00:00Z"));
  assert.equal(year.localDate, "2027-01-01");
  assert.equal(year.dayAfterTomorrow.date, "2027-01-03");
});

test("leap day handling and timezone is independent of host clock", () => {
  const leap = getNuboClockSnapshot("Asia/Taipei", new Date("2028-02-28T16:30:00Z"));
  assert.equal(leap.localDate, "2028-02-29");
  assert.equal(leap.tomorrow.date, "2028-03-01");
  const ny = getNuboClockSnapshot("America/New_York", new Date("2026-11-23T16:00:00Z"));
  assert.equal(ny.localIso, "2026-11-23T11:00:00-05:00");
});

test("daylight saving offset and invalid timezone fallback", () => {
  const summer = getNuboClockSnapshot("America/New_York", new Date("2026-07-01T16:00:00Z"));
  assert.equal(summer.localIso, "2026-07-01T12:00:00-04:00");
  const invalid = getNuboClockSnapshot("Not/Real_TimeZone", new Date("2026-11-23T16:00:00Z"));
  assert.equal(invalid.fallbackApplied, true);
  assert.equal(invalid.timezone, "Asia/Taipei");
  assert.equal(invalid.localDate, "2026-11-24");
});