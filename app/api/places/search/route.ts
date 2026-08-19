import { NextRequest, NextResponse } from "next/server";

type PlaceResult = {
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  mapsUrl: string;
};

type OverpassElement = {
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const UA = "AINUBO-NUBO/1.0 (maps result list)";

function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
) {
  const r = 6371000;
  const p1 = (aLat * Math.PI) / 180;
  const p2 = (bLat * Math.PI) / 180;
  const dp = ((bLat - aLat) * Math.PI) / 180;
  const dl = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(h)));
}

function categoryFromTags(tags: Record<string, string> = {}) {
  return (
    tags.amenity ||
    tags.shop ||
    tags.tourism ||
    tags.leisure ||
    tags.public_transport ||
    tags.railway ||
    "place"
  );
}

function queryMatches(
  query: string,
  tags: Record<string, string>,
  name: string,
) {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  const hay = [
    name,
    tags.amenity,
    tags.shop,
    tags.tourism,
    tags.leisure,
    tags.cuisine,
    tags.public_transport,
    tags.railway,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const groups: Array<[RegExp, string[]]> = [
    [/景點|觀光|旅遊|景點推薦/, ["tourism", "attraction", "museum", "viewpoint", "gallery", "park", "temple"]],
    [/交通|捷運|地鐵|車站|公車/, ["station", "subway", "bus", "public_transport", "railway", "stop"]],
    [/餐廳|美食|吃|餐飲/, ["restaurant", "food", "cafe", "fast_food", "cuisine"]],
    [/咖啡|咖啡廳/, ["cafe", "coffee"]],
    [/早餐/, ["restaurant", "cafe", "fast_food", "breakfast"]],
    [/便利商店|超商/, ["convenience"]],
    [/停車/, ["parking"]],
    [/藥局/, ["pharmacy"]],
    [/加油站/, ["fuel"]],
    [/商家|店家|周邊|附近/, []],
  ];

  for (const [re, keys] of groups) {
    if (re.test(q)) {
      return keys.length === 0 || keys.some((key) => hay.includes(key));
    }
  }

  return hay.includes(q) || name.toLowerCase().includes(q);
}

async function geocode(location: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", location);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "zh-TW");

  const response = await fetch(url, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`geocode ${response.status}`);

  const rows = (await response.json()) as Array<{
    lat: string;
    lon: string;
    display_name?: string;
  }>;
  if (!rows[0]) throw new Error("找不到指定地點");

  return {
    lat: Number(rows[0].lat),
    lng: Number(rows[0].lon),
    label: rows[0].display_name || location,
  };
}

async function overpass(lat: number, lng: number, radius: number) {
  const data = `[out:json][timeout:18];(nwr(around:${radius},${lat},${lng})["name"]["amenity"];nwr(around:${radius},${lat},${lng})["name"]["shop"];nwr(around:${radius},${lat},${lng})["name"]["tourism"];nwr(around:${radius},${lat},${lng})["name"]["leisure"];nwr(around:${radius},${lat},${lng})["name"]["public_transport"];nwr(around:${radius},${lat},${lng})["name"]["railway"];);out center tags 140;`;
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  let lastError = "places unavailable";
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": UA,
        },
        body: new URLSearchParams({ data }),
        cache: "no-store",
      });
      if (!response.ok) {
        lastError = `places ${response.status}`;
        continue;
      }
      return (await response.json()) as { elements?: OverpassElement[] };
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }

  throw new Error(lastError);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query ?? "").trim();
    const location = String(body?.location ?? "").trim();
    const inputLat = Number(body?.latitude);
    const inputLng = Number(body?.longitude);
    const limit = Math.min(12, Math.max(5, Number(body?.limit ?? 10) || 10));
    const radius = Math.min(
      3500,
      Math.max(800, Number(body?.radiusMeters ?? 2500) || 2500),
    );

    if (!query) {
      return NextResponse.json(
        { ok: false, error: "缺少搜尋條件" },
        { status: 400 },
      );
    }

    let anchor: { lat: number; lng: number; label: string };
    if (Number.isFinite(inputLat) && Number.isFinite(inputLng)) {
      anchor = {
        lat: inputLat,
        lng: inputLng,
        label: location || "目前位置",
      };
    } else if (location) {
      anchor = await geocode(location);
    } else {
      return NextResponse.json(
        {
          ok: false,
          needsCurrentLocation: true,
          error: "需要目前位置才能建立附近店家列表",
        },
        { status: 400 },
      );
    }

    const raw = await overpass(anchor.lat, anchor.lng, radius);
    const seen = new Set<string>();
    const results: PlaceResult[] = [];

    for (const item of raw.elements ?? []) {
      const tags = item.tags ?? {};
      const name = String(tags["name:zh"] || tags.name || "").trim();
      if (!name || !queryMatches(query, tags, name)) continue;

      const lat = Number(item.lat ?? item.center?.lat);
      const lng = Number(item.lon ?? item.center?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const distanceMeters = haversineMeters(
        anchor.lat,
        anchor.lng,
        lat,
        lng,
      );
      if (distanceMeters > radius) continue;

      const key = `${name}|${Math.round(lat * 10000)}|${Math.round(lng * 10000)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const address = [
        tags["addr:street"],
        tags["addr:housenumber"],
        tags["addr:district"],
        tags["addr:city"],
      ]
        .filter(Boolean)
        .join(" ");

      results.push({
        name,
        category: categoryFromTags(tags),
        address,
        lat,
        lng,
        distanceMeters,
        mapsUrl:
          "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(`${name} ${lat},${lng}`),
      });
    }

    results.sort((a, b) => a.distanceMeters - b.distanceMeters);
    const selected = results.slice(0, limit);

    return NextResponse.json({
      ok: true,
      query,
      requestedLocation: location || "目前位置",
      resolvedLocation: anchor.label,
      anchor: { lat: anchor.lat, lng: anchor.lng },
      radiusMeters: radius,
      resultCount: selected.length,
      results: selected,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "附近搜尋失敗",
      },
      { status: 500 },
    );
  }
}
