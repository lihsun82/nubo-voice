import fs from 'node:fs';

const CSS_MARKER = 'NUBO_YOUTUBE_VIDEO_FIRST_V3';
const MAPS_MARKER = 'NUBO_MAPS_SMOOTH_20_V5';
const PLACES_MARKER = 'NUBO_PLACES_FILL_20_V5';

// 1) Mobile YouTube UI: make video the primary surface and hide metadata text.
const cssPath = 'app/inline-music-v13.css';
let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes(CSS_MARKER)) {
  css += `\n\n/* ${CSS_MARKER}: mobile video-first player. */\n@media (max-width: 680px) {\n  .nubo-inline-music {\n    grid-template-columns: minmax(0, 1fr) 64px !important;\n    gap: 8px !important;\n    align-items: center !important;\n  }\n\n  .nubo-inline-music-frame {\n    width: 100% !important;\n    min-width: 0 !important;\n    aspect-ratio: 16 / 9 !important;\n    border-radius: 12px !important;\n  }\n\n  .nubo-inline-music-info {\n    display: none !important;\n  }\n\n  .nubo-inline-music-controls {\n    width: 64px !important;\n    min-width: 64px !important;\n    gap: 8px !important;\n  }\n\n  .nubo-inline-music-toggle,\n  .nubo-inline-music-stop {\n    width: 64px !important;\n    min-height: 64px !important;\n    padding: 0 !important;\n    border-radius: 14px !important;\n    font-size: 0 !important;\n  }\n\n  .nubo-inline-music-toggle::before,\n  .nubo-inline-music-stop::before {\n    display: inline-block;\n    font-size: 24px;\n    line-height: 1;\n  }\n\n  .nubo-inline-music-toggle[aria-label=\"暫停音樂\"]::before { content: \"⏸\"; }\n  .nubo-inline-music-toggle[aria-label=\"繼續音樂\"]::before { content: \"▶\"; }\n  .nubo-inline-music-toggle[aria-label=\"音樂正在自動啟動\"]::before { content: \"…\"; }\n  .nubo-inline-music-stop[aria-label=\"停止音樂\"]::before { content: \"■\"; font-size: 20px; }\n\n  body.nubo-inline-music-active .shell {\n    padding-bottom: max(220px, calc(env(safe-area-inset-bottom) + 210px)) !important;\n  }\n}\n`;
  fs.writeFileSync(cssPath, css);
}

// 2) Places API: 20 is a target, not just a maximum. Use Google primary +
// a same-category expansion in parallel, then merge OSM fallback if Google
// still has fewer than the requested amount.
const routePath = 'app/api/places/search/route.ts';
let route = fs.readFileSync(routePath, 'utf8');
route = route.replace(
  'const limit = Math.min(10, Math.max(5, Number(body?.limit ?? 8) || 8));',
  'const limit = Math.min(20, Math.max(5, Number(body?.limit ?? 20) || 20));',
);
route = route.replace(
  `const radius = Math.min(\n      2500,\n      Math.max(700, Number(body?.radiusMeters ?? 1800) || 1800),\n    );`,
  `const radius = Math.min(\n      8000,\n      Math.max(1200, Number(body?.radiusMeters ?? 5000) || 5000),\n    );`,
);

if (!route.includes(PLACES_MARKER)) {
  const googleFunctionPattern = /async function searchGooglePlaces\([\s\S]*?\n}\n\nasync function fetchOverpass/;
  if (!googleFunctionPattern.test(route)) {
    throw new Error('maps v5: Google Places function block missing');
  }

  const googleReplacement = `// ${PLACES_MARKER}\nfunction googleQueryVariants(query: string) {\n  const primary = query.trim();\n  const variants = [primary];\n\n  if (isVegetarianQuery(primary)) {\n    variants.push(\"素食 蔬食 餐廳\");\n  } else if (/餐廳|美食|吃|餐飲|restaurant|food/i.test(primary)) {\n    variants.push(\"餐廳 美食\");\n  } else if (/咖啡|咖啡廳|coffee|cafe/i.test(primary)) {\n    variants.push(\"咖啡廳 咖啡\");\n  } else if (/景點|觀光|旅遊|博物館|公園|attraction|museum|park/i.test(primary)) {\n    variants.push(\"景點 觀光\");\n  } else if (/交通|捷運|地鐵|車站|公車|station|transit|metro|subway/i.test(primary)) {\n    variants.push(\"捷運站 車站 公車站\");\n  } else {\n    variants.push(primary + \" 附近\");\n  }\n\n  return [...new Set(variants.filter(Boolean))].slice(0, 2);\n}\n\nasync function fetchGooglePlacesText(\n  textQuery: string,\n  lat: number,\n  lng: number,\n  radius: number,\n  limit: number,\n): Promise<PlaceResult[]> {\n  const apiKey = getGooglePlacesApiKey();\n  if (!apiKey) return [];\n\n  const controller = new AbortController();\n  const timer = setTimeout(() => controller.abort(), 4500);\n  try {\n    const response = await fetch(\n      \"https://places.googleapis.com/v1/places:searchText\",\n      {\n        method: \"POST\",\n        headers: {\n          \"Content-Type\": \"application/json\",\n          \"X-Goog-Api-Key\": apiKey,\n          \"X-Goog-FieldMask\": [\n            \"places.id\",\n            \"places.displayName\",\n            \"places.formattedAddress\",\n            \"places.location\",\n            \"places.googleMapsUri\",\n            \"places.websiteUri\",\n            \"places.photos\",\n            \"places.primaryType\",\n            \"places.primaryTypeDisplayName\",\n            \"places.rating\",\n            \"places.userRatingCount\",\n          ].join(\",\"),\n        },\n        body: JSON.stringify({\n          textQuery,\n          pageSize: Math.min(20, Math.max(1, limit)),\n          languageCode: \"zh-TW\",\n          locationBias: {\n            circle: {\n              center: { latitude: lat, longitude: lng },\n              radius: Math.min(50000, Math.max(500, radius)),\n            },\n          },\n        }),\n        cache: \"no-store\",\n        signal: controller.signal,\n      },\n    );\n\n    if (!response.ok) return [];\n    const payload = (await response.json()) as { places?: GooglePlace[] };\n    const places = Array.isArray(payload.places) ? payload.places : [];\n\n    return places\n      .map((place): PlaceResult | null => {\n        const name = String(place.displayName?.text || \"\").trim();\n        const placeLat = Number(place.location?.latitude);\n        const placeLng = Number(place.location?.longitude);\n        if (!name || !Number.isFinite(placeLat) || !Number.isFinite(placeLng)) {\n          return null;\n        }\n\n        const photo = place.photos?.[0];\n        const photoName = String(photo?.name || \"\").trim();\n        const attribution = (photo?.authorAttributions || [])\n          .map((item) => String(item.displayName || \"\").trim())\n          .filter(Boolean)\n          .join(\"、\");\n\n        return {\n          name,\n          category:\n            String(place.primaryTypeDisplayName?.text || \"\").trim() ||\n            String(place.primaryType || \"\").trim() ||\n            \"店家\",\n          address: String(place.formattedAddress || \"\").trim(),\n          lat: placeLat,\n          lng: placeLng,\n          distanceMeters: haversineMeters(lat, lng, placeLat, placeLng),\n          mapsUrl:\n            String(place.googleMapsUri || \"\").trim() ||\n            \"https://www.google.com/maps/search/?api=1&query=\" +\n              encodeURIComponent(\`\${name} \${placeLat},\${placeLng}\`),\n          imageUrl: photoName\n            ? \`/api/places/photo?name=\${encodeURIComponent(photoName)}\`\n            : undefined,\n          website: String(place.websiteUri || \"\").trim() || undefined,\n          rating:\n            typeof place.rating === \"number\" && Number.isFinite(place.rating)\n              ? place.rating\n              : undefined,\n          userRatingCount:\n            typeof place.userRatingCount === \"number\" &&\n            Number.isFinite(place.userRatingCount)\n              ? place.userRatingCount\n              : undefined,\n          provider: \"google\",\n          photoAttribution: attribution || undefined,\n        };\n      })\n      .filter((place): place is PlaceResult => Boolean(place));\n  } catch {\n    return [];\n  } finally {\n    clearTimeout(timer);\n  }\n}\n\nasync function searchGooglePlaces(\n  query: string,\n  lat: number,\n  lng: number,\n  radius: number,\n  limit: number,\n): Promise<PlaceResult[] | null> {\n  if (!getGooglePlacesApiKey()) return null;\n\n  const variants = googleQueryVariants(query);\n  const batches = await Promise.all(\n    variants.map((variant) =>\n      fetchGooglePlacesText(variant, lat, lng, radius, limit),\n    ),\n  );\n\n  const seen = new Set<string>();\n  const merged: PlaceResult[] = [];\n  for (const place of batches.flat()) {\n    if (place.distanceMeters > Math.max(radius * 4, 20000)) continue;\n    const key = [\n      place.name.toLowerCase().replace(/\\s+/g, \"\"),\n      Math.round(place.lat * 1000),\n      Math.round(place.lng * 1000),\n    ].join(\"|\");\n    if (seen.has(key)) continue;\n    seen.add(key);\n    merged.push(place);\n  }\n\n  merged.sort((a, b) => {\n    const distanceDelta = a.distanceMeters - b.distanceMeters;\n    if (distanceDelta !== 0) return distanceDelta;\n    return (b.rating ?? 0) - (a.rating ?? 0);\n  });\n\n  return merged.slice(0, limit);\n}\n\nasync function fetchOverpass`;
  route = route.replace(googleFunctionPattern, googleReplacement);

  const earlyGooglePattern = /    if \(googleResults && googleResults\.length > 0\) \{[\s\S]*?    \}\n\n    const cacheKey = \[/;
  if (!earlyGooglePattern.test(route)) {
    throw new Error('maps v5: early Google return block missing');
  }
  route = route.replace(
    earlyGooglePattern,
    `    if (googleResults && googleResults.length >= limit) {\n      return NextResponse.json({\n        ok: true,\n        query,\n        requestedLocation: location || \"目前位置\",\n        resolvedLocation: anchor.label,\n        anchor: { lat: anchor.lat, lng: anchor.lng },\n        radiusMeters: radius,\n        resultCount: googleResults.length,\n        provider: \"google\",\n        results: googleResults,\n      } satisfies PlaceResponse);\n    }\n\n    const cacheKey = [`,
  );

  const osmSelection = `    results.sort((a, b) => a.distanceMeters - b.distanceMeters);\n    const selected = results.slice(0, limit);\n    const value: PlaceResponse = {\n      ok: true,\n      query,\n      requestedLocation: location || \"目前位置\",\n      resolvedLocation: anchor.label,\n      anchor: { lat: anchor.lat, lng: anchor.lng },\n      radiusMeters: radius,\n      resultCount: selected.length,\n      provider: \"osm\",\n      results: selected,\n    };`;
  const mixedSelection = `    results.sort((a, b) => a.distanceMeters - b.distanceMeters);\n\n    const mergedSeen = new Set<string>();\n    const mergedResults: PlaceResult[] = [];\n    for (const place of [...(googleResults ?? []), ...results]) {\n      const key = [\n        place.name.toLowerCase().replace(/\\s+/g, \"\"),\n        Math.round(place.lat * 1000),\n        Math.round(place.lng * 1000),\n      ].join(\"|\");\n      if (mergedSeen.has(key)) continue;\n      mergedSeen.add(key);\n      mergedResults.push(place);\n    }\n    mergedResults.sort((a, b) => a.distanceMeters - b.distanceMeters);\n    const selected = mergedResults.slice(0, limit);\n    const value: PlaceResponse = {\n      ok: true,\n      query,\n      requestedLocation: location || \"目前位置\",\n      resolvedLocation: anchor.label,\n      anchor: { lat: anchor.lat, lng: anchor.lng },\n      radiusMeters: radius,\n      resultCount: selected.length,\n      provider: googleResults && googleResults.length > 0 ? \"google\" : \"osm\",\n      results: selected,\n    };`;
  if (!route.includes(osmSelection)) {
    throw new Error('maps v5: OSM selection block missing');
  }
  route = route.replace(osmSelection, mixedSelection);
}

if (!route.includes('Math.min(20, Math.max(5, Number(body?.limit ?? 20) || 20))')) {
  throw new Error('maps v5: Places limit patch missing');
}
if (!route.includes(PLACES_MARKER)) {
  throw new Error('maps v5: Places fill marker missing');
}
fs.writeFileSync(routePath, route);

// 3) Generated Maps overlay: wait briefly for geolocation, then load the map
// once at the correct area. Use the classic Google embed endpoint which is more
// reliable in mobile Chromium WebView/Chrome than the generic /maps URL.
const toolsPath = 'lib/browser-nubo-tools-line.ts';
let tools = fs.readFileSync(toolsPath, 'utf8');
if (!tools.includes(MAPS_MARKER)) {
  if (!tools.includes('NUBO_MAPS_CARD_LIST_V3')) {
    throw new Error('maps v5: Maps cards V3 must run first');
  }

  tools = tools.replace(
    '// NUBO_MAPS_CARD_LIST_V3',
    `// NUBO_MAPS_CARD_LIST_V3\n// ${MAPS_MARKER}`,
  );
  tools = tools.replace('timeout: 1200,', 'timeout: 700,');
  tools = tools.replace(
    'limit: 8,\n        radiusMeters: 1800,',
    'limit: 20,\n        radiusMeters: 5000,',
  );

  const doubleLoad = `  // Paint the map immediately. Current-position refinement happens afterward,\n  // so a geolocation prompt can no longer make the whole Maps screen feel frozen.\n  const preliminaryUrl = buildNuboMapsEmbedUrl(query, location, null);\n  holder.frame.src = preliminaryUrl;\n  holder.overlay.style.display = \"block\";\n\n  const position = location ? null : await readBrowserPosition();\n  const targetUrl = buildNuboMapsEmbedUrl(query, location, position);\n  const serial = ++nuboMapsSearchSerial;\n  if (location || position) holder.frame.src = targetUrl;`;

  const geoSingleLoad = `  // Resolve geolocation first (max ~700 ms), then navigate the heavy map once.\n  // This keeps map pins and the nearby result list anchored to the same area.\n  holder.overlay.style.display = \"block\";\n  const position = location ? null : await readBrowserPosition();\n  const targetUrl = buildNuboMapsEmbedUrl(query, location, position);\n  const serial = ++nuboMapsSearchSerial;\n  holder.frame.src = targetUrl;`;

  if (!tools.includes(doubleLoad)) {
    throw new Error('maps v5: double-load block missing');
  }
  tools = tools.replace(doubleLoad, geoSingleLoad);

  tools = tools.replaceAll(
    'https://www.google.com/maps?q=',
    'https://maps.google.com/maps?q=',
  );
  tools = tools.replace(
    'https://www.google.com/maps?output=embed',
    'https://maps.google.com/maps?output=embed',
  );
  tools = tools.replaceAll('&output=embed', '&z=14&output=embed');

  tools = tools.replace(
    'image.loading = index < 3 ? \"eager\" : \"lazy\";',
    'image.loading = index === 0 ? \"eager\" : \"lazy\";',
  );
  tools = tools.replace(
    '    holder.listBody.replaceChildren();\n',
    `    holder.listBody.replaceChildren();\n    holder.listBody.style.contain = \"content\";\n    holder.listBody.style.scrollBehavior = \"auto\";\n\n    const resultCount = document.createElement(\"div\");\n    resultCount.textContent = \"找到 \" + results.length + \" 個結果\";\n    Object.assign(resultCount.style, {\n      position: \"sticky\",\n      top: \"0\",\n      zIndex: \"2\",\n      padding: \"7px 11px\",\n      background: \"rgba(255,255,255,.97)\",\n      borderBottom: \"1px solid #e5e7eb\",\n      color: \"#5f6368\",\n      fontSize: \"12px\",\n      fontWeight: \"700\",\n    });\n    holder.listBody.appendChild(resultCount);\n`,
  );

  const cardAnchor = `      card.appendChild(button);`;
  const cardPerf = `      card.style.setProperty(\"content-visibility\", \"auto\");\n      card.style.setProperty(\"contain-intrinsic-size\", \"112px\");\n      card.appendChild(button);`;
  tools = tools.replace(cardAnchor, cardPerf);

  if (!tools.includes('limit: 20,\n        radiusMeters: 5000,')) {
    throw new Error('maps v5: frontend 20-place request missing');
  }
  if (!tools.includes('找到 \" + results.length + \" 個結果')) {
    throw new Error('maps v5: visible result counter missing');
  }
  if (!tools.includes(MAPS_MARKER)) {
    throw new Error('maps v5: marker missing');
  }

  fs.writeFileSync(toolsPath, tools);
}

console.log('Applied YouTube video-first UI plus Maps V5 20-result fill and stable single-load map');
