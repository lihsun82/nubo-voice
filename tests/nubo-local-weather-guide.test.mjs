import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  TAIWAN_WEATHER_REPRESENTATIVE_POINTS,
  isTaiwanWideWeatherRequest,
  coordinatesWithinTaiwan,
} from "../lib/nubo-taiwan-weather-regions.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const guide = read("../lib/nubo-jinxin-local-guide.ts");
const shared = read("../lib/nubo-jinxin-reference.ts");
const voice = read("../lib/browser-nubo-tools-line.ts");
const baseTool = read("../lib/browser-nubo-tools.ts");
const weather = read("../app/api/weather/route.ts");
const places = read("../app/api/places/search/route.ts");

test("all 22 Taiwan regions and islands have valid representative coordinates", () => {
  assert.equal(TAIWAN_WEATHER_REPRESENTATIVE_POINTS.length, 22);
  assert.equal(new Set(TAIWAN_WEATHER_REPRESENTATIVE_POINTS.map((p) => p.name)).size, 22);
  for (const p of TAIWAN_WEATHER_REPRESENTATIVE_POINTS) {
    assert.ok(coordinatesWithinTaiwan(p.lat, p.lng), p.name);
  }
  for (const county of ["臺北市", "新北市", "臺中市", "新竹縣", "新竹市", "嘉義縣", "嘉義市", "澎湖縣", "金門縣", "連江縣"]) {
    assert.ok(TAIWAN_WEATHER_REPRESENTATIVE_POINTS.some(p => p.name === county));
  }
});

test("only nationwide requests trigger all-Taiwan weather", () => {
  for (const query of ["全台", "全臺天氣", "全台的天氣", "全台各縣市天氣", "全台灣", "臺灣", "台灣各縣市天氣", "整個台灣天氣", "整個台灣天氣如何"]) {
    assert.ok(isTaiwanWideWeatherRequest(query), query);
  }
  for (const query of ["台中市北區", "金門縣金城鎮", "嘉義市", "新竹縣", "馬祖", "台北市內湖區"]) {
    assert.equal(isTaiwanWideWeatherRequest(query), false, query);
  }
  assert.equal(coordinatesWithinTaiwan(40.7128, -74.0060), false);
});

test("guide names and addresses are official-source-grounded and shared", () => {
  for (const term of ["一中商圈", "臺中公園", "臺中放送局", "臺中市孔廟", "國立臺中科技大學", "國立臺灣體育運動大學", "中國醫藥大學附設醫院", "臺安醫院雙十分院", "citybus.taichung.gov.tw"]) {
    assert.ok(guide.includes(term), term);
  }
  assert.match(shared, /\$\{NUBO_JINXIN_LOCAL_GUIDE\}/);
  assert.match(voice, /search_nearby/);
  assert.match(voice, /台中市北區一中商圈/);
});

test("place search supports actual schools and medical facilities", () => {
  assert.match(places, /學校\|大學/);
  assert.match(places, /醫院\|醫療\|急診/);
});

test("weather forecasts are dynamically fetched, not hallucinated", () => {
  assert.match(weather, /api\.open-meteo\.com/);
  assert.match(weather, /taiwan-22-county-seat-representative-forecast/);
  assert.match(weather, /representativeLocationOnly: true/);
  assert.match(weather, /regional_forecast_incomplete/);
  assert.match(weather, /countryCode/);
  assert.match(baseTool, /get_weather/);
  // The Taiwan safeguard must NOT force all global weather requests to TW.
  assert.match(weather, /if \(taiwanOnly\) url\.searchParams\.set\("countryCode", "TW"\)/);
  assert.match(weather, /!taiwanOnly \|\|/);
  assert.match(weather, /taiwanLocation,/);
});
