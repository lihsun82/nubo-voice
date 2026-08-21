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

  // Stop using a five-minute-old coarse location. Prefer a fresh GPS fix while
  // still allowing a very recent position to return quickly on repeated searches.
  source = source.replace(/enableHighAccuracy:\s*false,/g, 'enableHighAccuracy: true,');
  source = source.replace(/timeout:\s*(?:700|1200|2500),/g, 'timeout: 2200,');
  source = source.replace(/maximumAge:\s*300000,/g, 'maximumAge: 15000,');

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
  if (!source.includes('maximumAge: 15000,')) throw new Error('maps v6 fresh location patch missing');
  if (!source.includes('width: "116px"')) throw new Error('maps v6 larger image patch missing');

  fs.writeFileSync(toolsPath, source);
}

console.log('Applied Maps V6 precise geolocation, eager map and larger lazy-loaded cards');
