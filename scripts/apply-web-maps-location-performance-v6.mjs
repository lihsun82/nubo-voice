import fs from 'node:fs';

const toolsPath = 'lib/browser-nubo-tools-line.ts';
const marker = 'NUBO_MAPS_LOCATION_PERF_V6';
let source = fs.readFileSync(toolsPath, 'utf8');

if (!source.includes(marker)) {
  if (!source.includes('NUBO_MAPS_SMOOTH_20_V5')) {
    throw new Error('maps v6 requires NUBO_MAPS_SMOOTH_20_V5');
  }

  source = source.replace(
    '// NUBO_MAPS_SMOOTH_20_V5',
    `// NUBO_MAPS_SMOOTH_20_V5\n// ${marker}`,
  );

  // Replace the coarse five-minute cache with a short high-accuracy watch.
  // A fresh <=120m fix returns immediately; otherwise we keep the best fix for
  // at most 2.2s instead of accepting the first inaccurate network position.
  const positionPattern = /function readBrowserPosition\(\) \{[\s\S]*?\n\}\n\nfunction buildNuboMapsEmbedUrl/;
  if (!positionPattern.test(source)) {
    throw new Error('maps v6 readBrowserPosition block missing');
  }
  source = source.replace(
    positionPattern,
    `function readBrowserPosition() {\n  return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {\n    if (typeof navigator === \"undefined\" || !navigator.geolocation) {\n      resolve(null);\n      return;\n    }\n\n    let settled = false;\n    let watchId = -1;\n    let best: GeolocationPosition | null = null;\n    let timer = 0;\n\n    const finish = (position: GeolocationPosition | null) => {\n      if (settled) return;\n      settled = true;\n      if (watchId >= 0) navigator.geolocation.clearWatch(watchId);\n      if (timer) window.clearTimeout(timer);\n      resolve(position ? {\n        latitude: position.coords.latitude,\n        longitude: position.coords.longitude,\n      } : null);\n    };\n\n    const accept = (position: GeolocationPosition) => {\n      const accuracy = Number(position.coords.accuracy);\n      if (!best || accuracy < Number(best.coords.accuracy)) best = position;\n      if (Number.isFinite(accuracy) && accuracy <= 120) finish(position);\n    };\n\n    watchId = navigator.geolocation.watchPosition(\n      accept,\n      () => finish(best),\n      {\n        enableHighAccuracy: true,\n        timeout: 3200,\n        maximumAge: 15000,\n      },\n    );\n\n    timer = window.setTimeout(() => finish(best), 2200);\n  });\n}\n\nfunction buildNuboMapsEmbedUrl`,
  );

  // Make the map iframe start loading immediately once the accurate location is
  // resolved and tell the browser this frame is user-visible/important.
  source = source.replace(
    'frame.title = "Google Maps";',
    'frame.title = "Google Maps";\n  frame.loading = "eager";',
  );

  // Larger merchant photos while keeping 20-card scrolling light.
  source = source.replace(/gridTemplateColumns:\s*"92px minmax\(0, 1fr\)"/g, 'gridTemplateColumns: "116px minmax(0, 1fr)"');
  source = source.replace(/width:\s*"92px",\n\s*height:\s*"72px",/g, 'width: "116px",\n        height: "88px",');
  source = source.replace(/image\.loading = index < 3 \? "eager" : "lazy";/g, 'image.loading = index < 2 ? "eager" : "lazy";');
  source = source.replace(/paddingLeft:\s*"103px"/g, 'paddingLeft: "127px"');

  // Smooth the results panel without forcing the browser to paint all 20 cards
  // at once. This does not change the search order or Google Places data.
  source = source.replace(
    'holder.listBody.replaceChildren();',
    'holder.listBody.replaceChildren();\n    holder.listBody.style.setProperty("contain", "layout paint style");',
  );

  if (!source.includes(marker)) throw new Error('maps v6 marker missing');
  if (!source.includes('enableHighAccuracy: true,')) throw new Error('maps v6 high accuracy patch missing');
  if (!source.includes('accuracy <= 120')) throw new Error('maps v6 accuracy gate missing');
  if (!source.includes('maximumAge: 15000,')) throw new Error('maps v6 fresh location patch missing');
  if (!source.includes('width: "116px"')) throw new Error('maps v6 larger image patch missing');

  fs.writeFileSync(toolsPath, source);
}

console.log('Applied Maps V6 precise geolocation, eager map and larger lazy-loaded cards');
