const fs = require('fs');

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`[v68] no-op ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[v68] patched ${path}`);
}

patch('lib/browser-nubo-tools.ts', (source) => {
  let s = source;

  const oldRule = '1E-6. 先用語音整理搜尋結果，不要一律直接跳出NUBO開Google Maps；只有使用者明確說「開地圖／導航／帶我去」時才開地圖。';
  const newRule = '1E-6. NUBO_MAPS_LIST_V68：手機版查附近景點、餐廳、咖啡廳、商家或交通時，必須直接開啟Google Maps搜尋結果列表；搜尋字串必須包含完整location，不能只傳店家類型。NUBO可另外口頭摘要，但不得因摘要失敗而阻止地圖列表開啟。';
  if (s.includes(oldRule)) s = s.replace(oldRule, newRule);

  const oldBlock = `  if (name === "search_nearby") {\n    const query = String(args.query ?? "").trim();\n    const location = String(args.location ?? "").trim();\n    if (!query) throw new Error("缺少附近搜尋項目");\n    if (!location) {\n      return { ok: false, needsLocation: true, message: "請告訴我要以哪個地點為中心搜尋，或指定使用目前位置。" };\n    }\n\n    const result = await post("/api/places/search", {\n      query,\n      location,\n      limit: 12,\n      radiusMeters: 2500,\n    });\n\n    return {\n      ...result,\n      provider: "NUBO GeoLocked Places",\n      query,\n      requestedLocation: location,\n      locationLocked: true,\n      mapsUrl: buildMapsSearchUrl(query, location),\n    };\n  }`;

  const newBlock = `  if (name === "search_nearby") {\n    const query = String(args.query ?? "").trim();\n    const location = String(args.location ?? "").trim();\n    if (!query) throw new Error("缺少附近搜尋項目");\n    if (!location) {\n      return { ok: false, needsLocation: true, message: "請告訴我要以哪個地點為中心搜尋，或指定使用目前位置。" };\n    }\n\n    const mapsUrl = buildMapsSearchUrl(query, location);\n\n    // V68 mobile contract: Google Maps list is the primary result surface.\n    // Open it immediately so a slow/empty enrichment API can never block the user.\n    if (isMobileWebClient()) {\n      const opened = openClientUrl(mapsUrl);\n      let enriched = {};\n      try {\n        enriched = await post("/api/places/search", {\n          query,\n          location,\n          limit: 12,\n          radiusMeters: 2500,\n        });\n      } catch {\n        // Google Maps list is already open; enrichment is optional.\n      }\n      return {\n        ...enriched,\n        ...opened,\n        ok: true,\n        provider: "Google Maps + NUBO GeoLocked Places",\n        query,\n        requestedLocation: location,\n        locationLocked: true,\n        mapsUrl,\n        mapsListOpened: true,\n      };\n    }\n\n    const result = await post("/api/places/search", {\n      query,\n      location,\n      limit: 12,\n      radiusMeters: 2500,\n    });\n\n    return {\n      ...result,\n      provider: "NUBO GeoLocked Places",\n      query,\n      requestedLocation: location,\n      locationLocked: true,\n      mapsUrl,\n    };\n  }`;

  if (!s.includes(oldBlock)) throw new Error('V67 search_nearby block not found');
  s = s.replace(oldBlock, newBlock);

  if (!s.includes('NUBO_MAPS_LIST_V68')) throw new Error('V68 rule missing');
  if (!s.includes('mapsListOpened: true')) throw new Error('V68 maps list marker missing');
  return s;
});

patch('lib/browser-nubo-tools-line.ts', (source) => {
  let s = source;
  if (!s.includes('NUBO_MAPS_LIST_V68')) {
    const anchor = 'NUBO_NEARBY_GEOLOCK_V67：';
    s = s.replace(anchor, 'NUBO_MAPS_LIST_V68：手機版附近景點／餐廳／咖啡／商家／交通查詢，要直接開Google Maps搜尋結果列表，且搜尋字串必須帶完整指定地點；地點不可漂移。\\n\\n' + anchor);
  }
  if (!s.includes('NUBO_MAPS_LIST_V68')) throw new Error('V68 LINE rule missing');
  return s;
});

console.log('Applied V68 web: direct geo-locked Google Maps result list on mobile');
