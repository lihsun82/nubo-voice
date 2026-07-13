import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  location:
    z.string().trim().min(1).max(100).optional(),
});

function describeWeather(code: number) {
  if (code === 0) return "晴朗";
  if ([1, 2].includes(code))
    return "晴時多雲";
  if (code === 3) return "陰天";
  if ([45, 48].includes(code))
    return "有霧";
  if ([51, 53, 55, 56, 57].includes(code))
    return "毛毛雨";
  if ([61, 63, 65, 66, 67].includes(code))
    return "下雨";
  if ([71, 73, 75, 77].includes(code))
    return "降雪";
  if ([80, 81, 82].includes(code))
    return "陣雨";
  if ([85, 86].includes(code))
    return "陣雪";
  if ([95, 96, 99].includes(code))
    return "雷雨";
  return "天氣狀況不明";
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });

  const payload =
    await response.json();

  if (!response.ok) {
    throw new Error(
      payload?.reason ??
      `天氣服務回應失敗：${response.status}`,
    );
  }

  return payload;
}

export async function POST(
  request: NextRequest,
) {
  const parsed = schema.safeParse(
    await request.json().catch(() => ({})),
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: "天氣地點格式錯誤" },
      { status: 400 },
    );
  }

  const location =
    parsed.data.location ||
    process.env.NUBO_DEFAULT_LOCATION ||
    "台南";

  try {
    const geocodeUrl =
      new URL(
        "https://geocoding-api.open-meteo.com/v1/search",
      );

    geocodeUrl.searchParams.set(
      "name",
      location,
    );
    geocodeUrl.searchParams.set(
      "count",
      "1",
    );
    geocodeUrl.searchParams.set(
      "language",
      "zh",
    );
    geocodeUrl.searchParams.set(
      "format",
      "json",
    );

    const geocode =
      await fetchJson(
        geocodeUrl.toString(),
      );

    const place =
      geocode?.results?.[0];

    if (!place) {
      return NextResponse.json(
        {
          error:
            `找不到天氣地點：${location}`,
        },
        { status: 404 },
      );
    }

    const forecastUrl =
      new URL(
        "https://api.open-meteo.com/v1/forecast",
      );

    forecastUrl.searchParams.set(
      "latitude",
      String(place.latitude),
    );
    forecastUrl.searchParams.set(
      "longitude",
      String(place.longitude),
    );
    forecastUrl.searchParams.set(
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
    forecastUrl.searchParams.set(
      "daily",
      [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max",
      ].join(","),
    );
    forecastUrl.searchParams.set(
      "timezone",
      "auto",
    );
    forecastUrl.searchParams.set(
      "forecast_days",
      "2",
    );

    const forecast =
      await fetchJson(
        forecastUrl.toString(),
      );

    const current = forecast.current ?? {};
    const daily = forecast.daily ?? {};

    return NextResponse.json({
      ok: true,
      source: "Open-Meteo",
      location: {
        name: place.name,
        admin1: place.admin1,
        country: place.country,
        timezone: forecast.timezone,
      },
      current: {
        time: current.time,
        condition: describeWeather(
          Number(current.weather_code),
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
        condition: describeWeather(
          Number(daily.weather_code?.[0]),
        ),
        highC:
          daily.temperature_2m_max?.[0],
        lowC:
          daily.temperature_2m_min?.[0],
        rainChancePercent:
          daily
            .precipitation_probability_max?.[0],
      },
      tomorrow: {
        date: daily.time?.[1],
        condition: describeWeather(
          Number(daily.weather_code?.[1]),
        ),
        highC:
          daily.temperature_2m_max?.[1],
        lowC:
          daily.temperature_2m_min?.[1],
        rainChancePercent:
          daily
            .precipitation_probability_max?.[1],
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
      { status: 502 },
    );
  }
}
