/**
 * Taiwan 22 cities/counties. Representative points are county-seat / main
 * urban points, NOT an observation for every town or mountainous district.
 * This is used only for clearly labelled Taiwan-wide overviews.
 */
export const TAIWAN_WEATHER_REPRESENTATIVE_POINTS = [
  { name: "臺北市", lat: 25.033, lng: 121.565 },
  { name: "新北市", lat: 25.013, lng: 121.466 },
  { name: "桃園市", lat: 24.993, lng: 121.301 },
  { name: "臺中市", lat: 24.148, lng: 120.674 },
  { name: "臺南市", lat: 22.999, lng: 120.227 },
  { name: "高雄市", lat: 22.628, lng: 120.302 },
  { name: "基隆市", lat: 25.128, lng: 121.742 },
  { name: "新竹市", lat: 24.804, lng: 120.965 },
  { name: "新竹縣", lat: 24.828, lng: 121.011 },
  { name: "苗栗縣", lat: 24.565, lng: 120.820 },
  { name: "彰化縣", lat: 24.076, lng: 120.541 },
  { name: "南投縣", lat: 23.918, lng: 120.685 },
  { name: "雲林縣", lat: 23.710, lng: 120.543 },
  { name: "嘉義市", lat: 23.480, lng: 120.450 },
  { name: "嘉義縣", lat: 23.459, lng: 120.295 },
  { name: "屏東縣", lat: 22.667, lng: 120.488 },
  { name: "宜蘭縣", lat: 24.754, lng: 121.758 },
  { name: "花蓮縣", lat: 23.987, lng: 121.601 },
  { name: "臺東縣", lat: 22.758, lng: 121.144 },
  { name: "澎湖縣", lat: 23.568, lng: 119.565 },
  { name: "金門縣", lat: 24.432, lng: 118.319 },
  { name: "連江縣", lat: 26.160, lng: 119.950 },
] as const;

export function isTaiwanWideWeatherRequest(location: string) {
  const normalized = String(location || "").replace(/\s/g, "").replace(/臺/g, "台");
  return /^(?:全台|全台灣|台灣全境|台灣各縣市|全國|全台各地|全台各縣市|台灣|整個台灣)(?:地區|各地|各縣市|整體)?(?:今明天|今天|明天)?(?:的)?(?:天氣|天氣預報|氣象|預報)?(?:如何|怎麼樣|狀況|概況)?$/.test(normalized);
}

/** Covers Taiwan main island, Penghu, Kinmen, Matsu and nearby islands. */
export function coordinatesWithinTaiwan(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= 21.0 && lat <= 26.8 && lng >= 117.8 && lng <= 123.2;
}
