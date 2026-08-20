import { NextRequest, NextResponse } from "next/server";

type PlaceProvider = "google" | "osm";

type PlaceResult = {
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  mapsUrl: string;
  imageUrl?: string;
  website?: string;
  rating?: number;
  userRatingCount?: number;
  provider: PlaceProvider;
  photoAttribution?: string;
};

type OverpassElement = {
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
  websiteUri?: string;
  photos?: Array<{
    name?: string;
    authorAttributions?: Array<{ displayName?: string }>;
  }>;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
};

type PlaceResponse = {
  ok: true;
  query: string;
  requestedLocation: string;
  resolvedLocation: string;
  anchor: { lat: number; lng: number };
  radiusMeters: number;
  resultCount: number;
  provider: PlaceProvider;
  results: PlaceResult[];
  cached?: boolean;
};

const UA = "AINUBO-NUBO/1.0 (maps result list)";
const CACHE_TTL_MS = 120_000;
const responseCache = new Map<string, { at: number; value: PlaceResponse }>();

const VEGETARIAN_QUERY_RE =
  /素食|蔬食|純素|全素|奶蛋素|蛋奶素|vegan|vegetarian|plant\s*-?\s*based/i;
const VEGETARIAN_NAME_RE =
  /素食|蔬食|純素|全素|奶蛋素|蛋奶素|vegan|vegetarian|plant\s*-?\s*based/i;

function getGooglePlacesApiKey() {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    ""
  );
}

function isVegetarianQuery(query: string) {
  return VEGETARIAN_QUERY_RE.test(query);
}

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
  const cuisine = String(tags.cuisine || "").trim();
  if (/vegetarian|vegan/i.test(cuisine)) return "素食／蔬食";
  if (
    /^(?:yes|only)$/i.test(String(tags["diet:vegetarian"] || "")) ||
    /^(?:yes|only)$/i.test(String(tags["diet:vegan"] || ""))
  ) {
    return "素食／蔬食";
  }

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

function hasVegetarianSignal(tags: Record<string, string>, name: string) {
  const vegetarianDiet = String(tags["diet:vegetarian"] || "").trim();
  const veganDiet = String(tags["diet:vegan"] || "").trim();
  const cuisine = String(tags.cuisine || "").trim();
  const description = [
    String(tags.description || ""),
    String(tags["description:zh"] || ""),
  ].join(" ");

  return (
    /^(?:yes|only)$/i.test(vegetarianDiet) ||
    /^(?:yes|only)$/i.test(veganDiet) ||
    /vegetarian|vegan|plant\s*-?\s*based/i.test(cuisine) ||
    VEGETARIAN_NAME_RE.test(name) ||
    VEGETARIAN_NAME_RE.test(description)
  );
}

function queryMatches(
  query: string,
  tags: Record<string, string>,
  name: string,
) {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  // Precision first for vegetarian searches. Do not let generic restaurants,
  // cafes or chains pass just because the query also contains the word 餐廳.
  if (isVegetarianQuery(q)) {
    return hasVegetarianSignal(tags, name);
  }

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

function placeImageUrl(tags: Record<string, string>) {
  const direct = String(tags.image || "").trim();
  if (/^https?:\/\//i.test(direct)) return direct;

  const commons = String(tags.wikimedia_commons || "").trim();
  if (/^File:/i.test(commons)) {
    const filename = commons.replace(/^File:/i, "").trim();
    return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(filename)}?width=480`;
  }

  // Do not return a fuzzy static-map pin as a fake merchant photo.
  return undefined;
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

async function searchGooglePlaces(
  query: string,
  lat: number,
  lng: number,
  radius: number,
  limit: number,
): Promise<PlaceResult[] | null> {
  const apiKey = getGooglePlacesApiKey();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.location",
            "places.googleMapsUri",
            "places.websiteUri",
            "places.photos",
            "places.primaryType",
            "places.primaryTypeDisplayName",
            "places.rating",
            "places.userRatingCount",
          ].join(","),
        },
        body: JSON.stringify({
          textQuery: query,
          pageSize: limit,
          languageCode: "zh-TW",
          locationBias: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: Math.min(50000, Math.max(300, radius)),
            },
          },
        }),
        cache: "no-store",
        signal: controller.signal,
      },
    );

    if (!response.ok) return null;
    const payload = (await response.json()) as { places?: GooglePlace[] };
    const places = Array.isArray(payload.places) ? payload.places : [];

    return places
      .map((place): PlaceResult | null => {
        const name = String(place.displayName?.text || "").trim();
        const placeLat = Number(place.location?.latitude);
        const placeLng = Number(place.location?.longitude);
        if (!name || !Number.isFinite(placeLat) || !Number.isFinite(placeLng)) {
          return null;
        }

        const photo = place.photos?.[0];
        const photoName = String(photo?.name || "").trim();
        const attribution = (photo?.authorAttributions || [])
          .map((item) => String(item.displayName || "").trim())
          .filter(Boolean)
          .join("、");

        return {
          name,
          category:
            String(place.primaryTypeDisplayName?.text || "").trim() ||
            String(place.primaryType || "").trim() ||
            "店家",
          address: String(place.formattedAddress || "").trim(),
          lat: placeLat,
          lng: placeLng,
          distanceMeters: haversineMeters(lat, lng, placeLat, placeLng),
          mapsUrl:
            String(place.googleMapsUri || "").trim() ||
            "https://www.google.com/maps/search/?api=1&query=" +
              encodeURIComponent(`${name} ${placeLat},${placeLng}`),
          imageUrl: photoName
            ? `/api/places/photo?name=${encodeURIComponent(photoName)}`
            : undefined,
          website: String(place.websiteUri || "").trim() || undefined,
          rating:
            typeof place.rating === "number" && Number.isFinite(place.rating)
              ? place.rating
              : undefined,
          userRatingCount:
            typeof place.userRatingCount === "number" &&
            Number.isFinite(place.userRatingCount)
              ? place.userRatingCount
              : undefined,
          provider: "google",
          photoAttribution: attribution || undefined,
        };
      })
      .filter((place): place is PlaceResult => Boolean(place))
      .filter((place) => place.distanceMeters <= Math.max(radius * 1.8, 3000))
      .slice(0, limit);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOverpass(endpoint: string, data: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5500);
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

function buildOverpassData(query: string, lat: number, lng: number, radius: number) {
  if (isVegetarianQuery(query)) {
    // Tight vegetarian query: this intentionally favors precision over recall.
    return `[out:json][timeout:7];(nwr(around:${radius},${lat},${lng})["name"]["diet:vegetarian"~"^(yes|only)$",i];nwr(around:${radius},${lat},${lng})["name"]["diet:vegan"~"^(yes|only)$",i];nwr(around:${radius},${lat},${lng})["name"]["cuisine"~"vegetarian|vegan|plant.?based",i];nwr(around:${radius},${lat},${lng})["name"~"素食|蔬食|純素|全素|奶蛋素|蛋奶素|vegan|vegetarian|plant.?based",i];);out center tags 70;`;
  }

  return `[out:json][timeout:8];(nwr(around:${radius},${lat},${lng})["name"]["amenity"];nwr(around:${radius},${lat},${lng})["name"]["shop"];nwr(around:${radius},${lat},${lng})["name"]["tourism"];nwr(around:${radius},${lat},${lng})["name"]["leisure"];nwr(around:${radius},${lat},${lng})["name"]["public_transport"];nwr(around:${radius},${lat},${lng})["name"]["railway"];);out center tags 90;`;
}

async function overpass(query: string, lat: number, lng: number, radius: number) {
  const data = buildOverpassData(query, lat, lng, radius);
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

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

    // Prefer Google Places when a dedicated server-side key exists. Text Search
    // handles intent such as 素食餐廳 much more accurately than generic OSM tags.
    const googleResults = await searchGooglePlaces(
      query,
      anchor.lat,
      anchor.lng,
      radius,
      limit,
    );

    if (googleResults && googleResults.length > 0) {
      return NextResponse.json({
        ok: true,
        query,
        requestedLocation: location || "目前位置",
        resolvedLocation: anchor.label,
        anchor: { lat: anchor.lat, lng: anchor.lng },
        radiusMeters: radius,
        resultCount: googleResults.length,
        provider: "google",
        results: googleResults,
      } satisfies PlaceResponse);
    }

    const cacheKey = [
      "osm",
      query.toLowerCase(),
      location.toLowerCase(),
      anchor.lat.toFixed(3),
      anchor.lng.toFixed(3),
      radius,
      limit,
    ].join("|");
    const cached = readCache(cacheKey);
    if (cached) return NextResponse.json(cached);

    const raw = await overpass(query, anchor.lat, anchor.lng, radius);
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
        imageUrl: placeImageUrl(tags),
        website: safeWebsite(tags),
        provider: "osm",
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
      provider: "osm",
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
