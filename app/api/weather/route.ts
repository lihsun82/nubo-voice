import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LOCATION =
  process.env.NUBO_DEFAULT_LOCATION ||
  "台南";

const schema = z.object({
  location:
    z.string().trim().min(1).max(200).optional(),
});

type ResolvedPlace = {
  name: string;
  admin1?: string;
  country?: string;
  displayName: string;
  latitude: number;
  longitude: number;
  method:
    | "open-meteo"
    | "nominatim"
    | "parent-city";
  approximate: boolean;
};

type Forecast = {
  timezone?: string;
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type WeatherGlobal =
  typeof globalThis & {
    __nuboSmartWeatherPlaces?: Map<
      string,
      CacheEntry<ResolvedPlace>
    >;
    __nuboSmartWeatherForecasts?: Map<
      string,
      CacheEntry<Forecast>
    >;
  };

const weatherGlobal =
  globalThis as WeatherGlobal;

const placeCache =
  weatherGlobal.__nuboSmartWeatherPlaces ??
  new Map<
    string,
    CacheEntry<ResolvedPlace>
  >();

const forecastCache =
  weatherGlobal.__nuboSmartWeatherForecasts ??
  new Map<
    string,
    CacheEntry<Forecast>
  >();

weatherGlobal.__nuboSmartWeatherPlaces =
  placeCache;

weatherGlobal.__nuboSmartWeatherForecasts =
  forecastCache;

const PLACE_CACHE_MS =
  7 * 24 * 60 * 60_000;

const FORECAST_CACHE_MS =
  2 * 60_000;

const taiwanCities = [
  {
    pattern: /台北|臺北/,
    english: "Taipei",
  },
  {
    pattern: /新北/,
    english: "New Taipei City",
  },
  {
    pattern: /桃園/,
    english: "Taoyuan",
  },
  {
    pattern: /台中|臺中/,
    english: "Taichung",
  },
  {
    pattern: /台南|臺南/,
    english: "Tainan",
  },
  {
    pattern: /高雄/,
    english: "Kaohsiung",
  },
  {
    pattern: /基隆/,
    english: "Keelung",
  },
  {
    pattern: /新竹/,
    english: "Hsinchu",
  },
  {
    pattern: /苗栗/,
    english: "Miaoli",
  },
  {
    pattern: /彰化/,
    english: "Changhua",
  },
  {
    pattern: /南投/,
    english: "Nantou",
  },
  {
    pattern: /雲林/,
    english: "Yunlin",
  },
  {
    pattern: /嘉義/,
    english: "Chiayi",
  },
  {
    pattern: /屏東/,
    english: "Pingtung",
  },
  {
    pattern: /宜蘭/,
    english: "Yilan",
  },
  {
    pattern: /花蓮/,
    english: "Hualien",
  },
  {
    pattern: /台東|臺東/,
    english: "Taitung",
  },
  {
    pattern: /澎湖/,
    english: "Penghu",
  },
  {
    pattern: /金門/,
    english: "Kinmen",
  },
  {
    pattern: /馬祖|連江/,
    english: "Lienchiang",
  },
];

function normalizeLocation(value: string) {
  return value
    .trim()
    .replace(/臺/g, "台")
    .replace(/\s+/g, "");
}

function looksLikeTaiwanLocation(
  location: string,
) {
  return (
    taiwanCities.some(({ pattern }) =>
      pattern.test(location),
    ) ||
    /[區鄉鎮村里路街段巷號]$/.test(
      location,
    )
  );
}

function isDetailedLocation(
  location: string,
) {
  return /區|鄉|鎮|村|里|路|街|段|巷|號/.test(
    location,
  );
}

function findTaiwanCity(
  location: string,
) {
  return taiwanCities.find(({ pattern }) =>
    pattern.test(location),
  );
}

function describeWeather(code: number) {
  if (code === 0) return "晴朗";
  if ([1, 2].includes(code))
    return "晴時多雲";
  if (code === 3) return "陰天";
  if ([45, 48].includes(code))
    return "有霧";
  if (
    [51, 53, 55, 56, 57].includes(code)
  ) {
    return "毛毛雨";
  }
  if (
    [61, 63, 65, 66, 67].includes(code)
  ) {
    return "下雨";
  }
  if (
    [71, 73, 75, 77].includes(code)
  ) {
    return "降雪";
  }
  if ([80, 81, 82].includes(code))
    return "陣雨";
  if ([85, 86].includes(code))
    return "陣雪";
  if ([95, 96, 99].includes(code))
    return "雷雨";

  return "天氣狀況不明";
}

async function fetchJson<T>(
  url: string,
  headers?: HeadersInit,
): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers,
    signal: AbortSignal.timeout(6000),
  });

  const payload =
    await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.reason ??
      payload?.error ??
      `外部服務錯誤：${response.status}`,
    );
  }

  return payload as T;
}

async function resolveWithOpenMeteo(
  query: string,
  approximate: boolean,
): Promise<ResolvedPlace | null> {
  const url = new URL(
    "https://geocoding-api.open-meteo.com/v1/search",
  );

  url.searchParams.set("name", query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "zh");
  url.searchParams.set("format", "json");

  const result = await fetchJson<{
    results?: Array<{
      name: string;
      admin1?: string;
      country?: string;
      latitude: number;
      longitude: number;
    }>;
  }>(url.toString());

  const place = result.results?.[0];

  if (!place) {
    return null;
  }

  return {
    name: place.name,
    admin1: place.admin1,
    country: place.country,
    displayName: [
      place.name,
      place.admin1,
      place.country,
    ]
      .filter(Boolean)
      .join("，"),
    latitude: place.latitude,
    longitude: place.longitude,
    method: approximate
      ? "parent-city"
      : "open-meteo",
    approximate,
  };
}

async function resolveWithNominatim(
  query: string,
  taiwanOnly: boolean,
): Promise<ResolvedPlace | null> {
  const url = new URL(
    "https://nominatim.openstreetmap.org/search",
  );

  url.searchParams.set("q", query);
  url.searchParams.set(
    "format",
    "jsonv2",
  );
  url.searchParams.set("limit", "1");
  url.searchParams.set(
    "addressdetails",
    "1",
  );
  url.searchParams.set(
    "accept-language",
    "zh-TW",
  );

  if (taiwanOnly) {
    url.searchParams.set(
      "countrycodes",
      "tw",
    );
  }

  const publicUrl =
    process.env.NUBO_PUBLIC_URL ||
    "https://nubo.ainubo.com";

  const results = await fetchJson<
    Array<{
      display_name: string;
      lat: string;
      lon: string;
      address?: Record<string, string>;
    }>
  >(url.toString(), {
    "User-Agent":
      `NUBO-Voice/1.0 (${publicUrl})`,
    "Accept-Language":
      "zh-TW,zh;q=0.9,en;q=0.6",
  });

  const result = results[0];

  if (!result) {
    return null;
  }

  const address = result.address ?? {};

  const name =
    address.suburb ||
    address.city_district ||
    address.borough ||
    address.city ||
    address.town ||
    address.village ||
    result.display_name.split(",")[0];

  const latitude = Number(result.lat);
  const longitude = Number(result.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return {
    name,
    admin1:
      address.city ||
      address.county ||
      address.state,
    country: address.country,
    displayName: result.display_name,
    latitude,
    longitude,
    method: "nominatim",
    approximate: false,
  };
}

async function resolvePlace(
  rawLocation: string,
) {
  const location =
    normalizeLocation(rawLocation);

  const cacheKey =
    location.toLowerCase();

  const cached =
    placeCache.get(cacheKey);

  if (
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return {
      place: cached.value,
      cacheHit: true,
    };
  }

  const taiwanLocation =
    looksLikeTaiwanLocation(location);

  const detailed =
    isDetailedLocation(location);

  let place: ResolvedPlace | null =
    null;

  if (detailed) {
    try {
      place = await resolveWithNominatim(
        taiwanLocation
          ? `${location}, Taiwan`
          : location,
        taiwanLocation,
      );
    } catch {
      place = null;
    }
  }

  const city =
    findTaiwanCity(location);

  if (!place && city && !detailed) {
    try {
      place = await resolveWithOpenMeteo(
        `${city.english}, Taiwan`,
        false,
      );
    } catch {
      place = null;
    }
  }

  if (!place && !detailed) {
    try {
      place = await resolveWithOpenMeteo(
        location,
        false,
      );
    } catch {
      place = null;
    }
  }

  if (!place) {
    try {
      place = await resolveWithNominatim(
        taiwanLocation
          ? `${location}, Taiwan`
          : location,
        taiwanLocation,
      );
    } catch {
      place = null;
    }
  }

  if (!place && city) {
    try {
      place = await resolveWithOpenMeteo(
        `${city.english}, Taiwan`,
        detailed,
      );
    } catch {
      place = null;
    }
  }

  if (!place) {
    throw new Error(
      `目前無法解析地點「${rawLocation}」，請改說鄰近城市、行政區或完整地址。`,
    );
  }

  placeCache.set(cacheKey, {
    value: place,
    expiresAt:
      Date.now() + PLACE_CACHE_MS,
  });

  return {
    place,
    cacheHit: false,
  };
}

async function loadForecast(
  place: ResolvedPlace,
) {
  const cacheKey =
    `${place.latitude.toFixed(4)},` +
    `${place.longitude.toFixed(4)}`;

  const cached =
    forecastCache.get(cacheKey);

  if (
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return {
      forecast: cached.value,
      cacheHit: true,
    };
  }

  const url = new URL(
    "https://api.open-meteo.com/v1/forecast",
  );

  url.searchParams.set(
    "latitude",
    String(place.latitude),
  );
  url.searchParams.set(
    "longitude",
    String(place.longitude),
  );
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
    ].join(","),
  );
  url.searchParams.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
    ].join(","),
  );
  url.searchParams.set(
    "timezone",
    "auto",
  );
  url.searchParams.set(
    "forecast_days",
    "2",
  );

  const forecast =
    await fetchJson<Forecast>(
      url.toString(),
    );

  forecastCache.set(cacheKey, {
    value: forecast,
    expiresAt:
      Date.now() + FORECAST_CACHE_MS,
  });

  return {
    forecast,
    cacheHit: false,
  };
}

async function weatherResponse(
  location: string,
) {
  const startedAt = Date.now();

  try {
    const placeResult =
      await resolvePlace(location);

    const forecastResult =
      await loadForecast(
        placeResult.place,
      );

    const current =
      forecastResult.forecast.current ??
      {};

    const daily =
      forecastResult.forecast.daily ??
      {};

    return NextResponse.json({
      ok: true,
      source: "Open-Meteo",
      requestedLocation: location,
      resolvedLocation: {
        name: placeResult.place.name,
        admin1:
          placeResult.place.admin1,
        country:
          placeResult.place.country,
        displayName:
          placeResult.place.displayName,
        latitude:
          placeResult.place.latitude,
        longitude:
          placeResult.place.longitude,
        method:
          placeResult.place.method,
        approximate:
          placeResult.place.approximate,
      },
      current: {
        time: current.time,
        condition:
          describeWeather(
            Number(
              current.weather_code ??
              -1,
            ),
          ),
        temperatureC:
          current.temperature_2m,
        apparentTemperatureC:
          current.apparent_temperature,
        humidityPercent:
          current.relative_humidity_2m,
        precipitationMm:
          current.precipitation,
        windSpeedKmh:
          current.wind_speed_10m,
      },
      today: {
        date: daily.time?.[0],
        condition:
          describeWeather(
            Number(
              daily.weather_code?.[0] ??
              -1,
            ),
          ),
        highC:
          daily
            .temperature_2m_max?.[0],
        lowC:
          daily
            .temperature_2m_min?.[0],
        rainChancePercent:
          daily
            .precipitation_probability_max?.[0],
      },
      tomorrow: {
        date: daily.time?.[1],
        condition:
          describeWeather(
            Number(
              daily.weather_code?.[1] ??
              -1,
            ),
          ),
        highC:
          daily
            .temperature_2m_max?.[1],
        lowC:
          daily
            .temperature_2m_min?.[1],
        rainChancePercent:
          daily
            .precipitation_probability_max?.[1],
      },
      performance: {
        totalMs:
          Date.now() - startedAt,
        placeCacheHit:
          placeResult.cacheHit,
        forecastCacheHit:
          forecastResult.cacheHit,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "天氣查詢失敗",
      },
      { status: 422 },
    );
  }
}

export async function GET(
  request: NextRequest,
) {
  const location =
    request.nextUrl.searchParams.get(
      "location",
    ) ||
    DEFAULT_LOCATION;

  return weatherResponse(location);
}

export async function POST(
  request: NextRequest,
) {
  const parsed = schema.safeParse(
    await request
      .json()
      .catch(() => ({})),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "天氣地點格式錯誤" },
      { status: 400 },
    );
  }

  return weatherResponse(
    parsed.data.location ||
    DEFAULT_LOCATION,
  );
}