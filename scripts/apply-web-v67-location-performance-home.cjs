const fs = require('fs');

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`[v67] no-op ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[v67] patched ${path}`);
}

patch('lib/browser-nubo-tools.ts', (source) => {
  let s = source;

  const oldRules = `1E. NUBO_MOBILE_PLACES_V1：使用者詢問附近、周邊、這附近、住家附近的飲料店、因料店、餐廳、咖啡廳、早餐店、便利商店、藥局、停車場、加油站或其他店家時，立即呼叫search_nearby，不得呼叫research_now。\n1E-1. 只傳入店家類型或搜尋條件，例如「飲料店」「評價好的餐廳」「營業中的咖啡廳」。使用者有指定城市或行政區時才填location。\n1E-2. 使用者只說附近、周邊、這裡或我住的周邊時，不得自行改成台南；location保持空白，讓Google Maps使用手機目前位置。\n1E-3. search_nearby會直接開啟Google Maps；工具完成後只需簡短說已開啟，不要再重複深度搜尋。`;
  const newRules = `1E. NUBO_NEARBY_GEOLOCK_V67：使用者詢問指定地點周邊的商家、餐廳、咖啡、景點、停車、捷運、公車、車站或其他交通資訊時，立即呼叫search_nearby。\n1E-1. 地點是硬限制。使用者說「台北忠孝復興」時，location必須完整傳「台北市忠孝復興」；不得改成台中、台南、目前位置或其他城市。忠孝復興一律視為台北市大安區／忠孝復興捷運站周邊，除非使用者明確指定別的同名地點。\n1E-2. 使用者指定城市、行政區、地址、捷運站或地標後，後續說「附近」「周邊」「再找幾個」都要沿用該地點，直到使用者明確換地點。不得自行套用台南預設值。\n1E-3. search_nearby會以指定地點座標為中心做半徑限制並回傳實際候選清單。回答時優先提供8到12筆有用資訊，包含名稱、類型、約略距離；資訊不足才少於8筆，不得為湊數跨縣市。\n1E-4. 查「景點」要以attraction/tourism/park/museum等為主；查「交通」要以捷運、火車、公車站等為主；查「商家」可混合餐飲、零售、便利服務。\n1E-5. 只有使用者完全沒有指定地點時，才可要求使用目前位置。若工具回傳locationLocked=true，回答不得加入不同城市的結果。\n1E-6. 先用語音整理搜尋結果，不要一律直接跳出NUBO開Google Maps；只有使用者明確說「開地圖／導航／帶我去」時才開地圖。`;
  if (s.includes(oldRules)) s = s.replace(oldRules, newRules);

  const oldBlock = `  if (name === "search_nearby") {\n    const query =\n      String(args.query ?? "").trim();\n\n    const location =\n      String(\n        args.location ?? "",\n      ).trim();\n\n    if (!query) {\n      throw new Error(\n        "缺少附近搜尋項目",\n      );\n    }\n\n    const url =\n      buildMapsSearchUrl(\n        query,\n        location || undefined,\n      );\n\n    if (isMobileWebClient()) {\n      return {\n        ...openClientUrl(url),\n        provider: "Google Maps",\n        query,\n        location:\n          location || "目前位置",\n      };\n    }\n\n    return post(\n      "/api/system/open-website",\n      { target: url },\n    );\n  }`;
  const newBlock = `  if (name === "search_nearby") {\n    const query = String(args.query ?? "").trim();\n    const location = String(args.location ?? "").trim();\n    if (!query) throw new Error("缺少附近搜尋項目");\n    if (!location) {\n      return { ok: false, needsLocation: true, message: "請告訴我要以哪個地點為中心搜尋，或指定使用目前位置。" };\n    }\n\n    const result = await post("/api/places/search", {\n      query,\n      location,\n      limit: 12,\n      radiusMeters: 2500,\n    });\n\n    return {\n      ...result,\n      provider: "NUBO GeoLocked Places",\n      query,\n      requestedLocation: location,\n      locationLocked: true,\n      mapsUrl: buildMapsSearchUrl(query, location),\n    };\n  }`;
  if (s.includes(oldBlock)) s = s.replace(oldBlock, newBlock);

  if (!s.includes('NUBO_NEARBY_GEOLOCK_V67')) throw new Error('V67 geo-lock rules missing');
  if (!s.includes('/api/places/search')) throw new Error('V67 enriched nearby API missing');
  if (!s.includes('radiusMeters: 2500')) throw new Error('V67 nearby radius missing');
  return s;
});

patch('lib/browser-nubo-tools-line.ts', (source) => {
  let s = source;
  if (!s.includes('NUBO_NEARBY_GEOLOCK_V67')) {
    const anchor = '快速路由：';
    const rule = 'NUBO_NEARBY_GEOLOCK_V67：凡是附近／周邊商家、景點、交通查詢，只要使用者說出地點，就把該地點視為硬限制；不得跨城市補結果。台北忠孝復興必須鎖定台北市大安區忠孝復興捷運站周邊。優先回覆8到12筆名稱、類型與距離，再依使用者要求開地圖。\\n\\n';
    s = s.replace(anchor, rule + anchor);
  }
  if (!s.includes('NUBO_NEARBY_GEOLOCK_V67')) throw new Error('V67 LINE geo rule missing');
  return s;
});

console.log('Applied V67 web: geo-locked richer nearby places');
