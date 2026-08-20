import { NextRequest, NextResponse } from "next/server";

type PlaceResult = {
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  mapsUrl: string;
  imageUrl: string;
  website?: string;
};

type OverpassElement = {
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type PlaceResponse = {
  ok: true;
  query: string;
  requestedLocation: string;
  resolvedLocation: string;
  anchor: { lat: number; lng: number };
  radiusMeters: number;
  resultCount: number;
  results: PlaceResult[];
  cached?: boolean;
};

const UA = "AINUBO-NUBO/1.0 (maps result list)";
const CACHE_TTL_MS = 120_000;
const responseCache = new Map<string, { at: number; value: PlaceResponse }>();

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

function safeWebsite(tags: Record<string, string>) {
  const raw = String(tags.website || tags["contact:website"] || "").trim();
  if (!raw) return undefined;
  try {
    const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function placeImageUrl(tags: Record<string, string>, lat: number, lng: number) {
  const direct = String(tags.image || "").trim();
  if (/^https?:\/\//i.test(direct)) return direct;

  const commons = String(tags.wikimedia_commons || "").trim();
  if (/^File:/i.test(commons)) {
    const filename = commons.replace(/^File:/i, "").trim();
    return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}?width=360`;
  }

  // Every result still gets a useful visual thumbnail even when the place has no
  // public merchant photo in OSM/Wikimedia. The image is loaded lazily by the UI.
  const center = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return (
    "https://staticmap.openstreetmap.de/staticmap.php?" +
    new URLSearchParams({
      center,
      zoom: "16",
      size: "360x200",
      markers: `${center},red-pushpin`,
    }).toString()
  );
}

async function geocode(location: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", location);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "zh-TW");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA },
      cache: "no-store",
      signal: controller.signal,
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
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOverpass(endpoint: string, data: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: new URLSearchParams({ data }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`places ${response.status}`);
    return (await response.json()) as { elements?: OverpassElement[] };
  } finally {
    clearTimeout(timer);
  }
}

async function overpass(lat: number, lng: number, radius: number) {
  const data = `[out:json][timeout:8];(nwr(around:${radius},${lat},${lng})["name"]["amenity"];nwr(around:${radius},${lat},${lng})["name"]["shop"];nwr(around:${radius},${lat},${lng})["name"]["tourism"];nwr(around:${radius},${lat},${lng})["name"]["leisure"];nwr(around:${radius},${lat},${lng})["name"]["public_transport"];nwr(around:${radius},${lat},${lng})["name"]["railway"];);out center tags 90;`;
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  // Race two public mirrors; take the first healthy response instead of waiting
  // for a slow primary endpoint before trying the fallback.
  try {
    return await Promise.any(endpoints.map((endpoint) => fetchOverpass(endpoint, data)));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "places unavailable");
  }
}

function readCache(key: string) {
  const cached = responseCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.at > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return { ...cached.value, cached: true };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body?.query ?? "").trim();
    const location = String(body?.location ?? "").trim();
    const inputLat = Number(body?.latitude);
    const inputLng = Number(body?.longitude);
    const limit = Math.min(10, Math.max(5, Number(body?.limit ?? 8) || 8));
    const radius = Math.min(
      2500,
      Math.max(700, Number(body?.radiusMeters ?? 1800) || 1800),
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

    const cacheKey = [
      query.toLowerCase(),
      location.toLowerCase(),
      anchor.lat.toFixed(3),
      anchor.lng.toFixed(3),
      radius,
      limit,
    ].join("|");
    const cached = readCache(cacheKey);
    if (cached) return NextResponse.json(cached);

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
        imageUrl: placeImageUrl(tags, lat, lng),
        website: safeWebsite(tags),
      });
    }

    results.sort((a, b) => a.distanceMeters - b.distanceMeters);
    const selected = results.slice(0, limit);
    const value: PlaceResponse = {
      ok: true,
      query,
      requestedLocation: location || "目前位置",
      resolvedLocation: anchor.label,
      anchor: { lat: anchor.lat, lng: anchor.lng },
      radiusMeters: radius,
      resultCount: selected.length,
      results: selected,
    };

    responseCache.set(cacheKey, { at: Date.now(), value });
    return NextResponse.json(value);
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
