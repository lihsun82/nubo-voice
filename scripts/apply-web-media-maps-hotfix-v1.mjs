import fs from 'node:fs';

const CSS_MARKER = 'NUBO_YOUTUBE_VIDEO_FIRST_V3';
const MAPS_MARKER = 'NUBO_MAPS_SMOOTH_20_V4';

// 1) Mobile YouTube UI: make video the primary surface and hide metadata text.
const cssPath = 'app/inline-music-v13.css';
let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes(CSS_MARKER)) {
  css += `\n\n/* ${CSS_MARKER}: mobile video-first player. */\n@media (max-width: 680px) {\n  .nubo-inline-music {\n    grid-template-columns: minmax(0, 1fr) 64px !important;\n    gap: 8px !important;\n    align-items: center !important;\n  }\n\n  .nubo-inline-music-frame {\n    width: 100% !important;\n    min-width: 0 !important;\n    aspect-ratio: 16 / 9 !important;\n    border-radius: 12px !important;\n  }\n\n  .nubo-inline-music-info {\n    display: none !important;\n  }\n\n  .nubo-inline-music-controls {\n    width: 64px !important;\n    min-width: 64px !important;\n    gap: 8px !important;\n  }\n\n  .nubo-inline-music-toggle,\n  .nubo-inline-music-stop {\n    width: 64px !important;\n    min-height: 64px !important;\n    padding: 0 !important;\n    border-radius: 14px !important;\n    font-size: 0 !important;\n  }\n\n  .nubo-inline-music-toggle::before,\n  .nubo-inline-music-stop::before {\n    display: inline-block;\n    font-size: 24px;\n    line-height: 1;\n  }\n\n  .nubo-inline-music-toggle[aria-label=\"暫停音樂\"]::before { content: \"⏸\"; }\n  .nubo-inline-music-toggle[aria-label=\"繼續音樂\"]::before { content: \"▶\"; }\n  .nubo-inline-music-toggle[aria-label=\"音樂正在自動啟動\"]::before { content: \"…\"; }\n  .nubo-inline-music-stop[aria-label=\"停止音樂\"]::before { content: \"■\"; font-size: 20px; }\n\n  body.nubo-inline-music-active .shell {\n    padding-bottom: max(220px, calc(env(safe-area-inset-bottom) + 210px)) !important;\n  }\n}\n`;
  fs.writeFileSync(cssPath, css);
}

// 2) Places API: request Google's maximum page size (20) and a wider nearby radius.
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
route = route.replace(
  '.filter((place) => place.distanceMeters <= Math.max(radius * 1.8, 3000))',
  '.filter((place) => place.distanceMeters <= Math.max(radius * 3, 15000))',
);

if (!route.includes('Math.min(20, Math.max(5, Number(body?.limit ?? 20) || 20))')) {
  throw new Error('maps hotfix: Places limit patch missing');
}
if (!route.includes('Number(body?.radiusMeters ?? 5000)')) {
  throw new Error('maps hotfix: Places radius patch missing');
}
fs.writeFileSync(routePath, route);

// 3) Generated Maps web overlay: avoid loading the heavy Google Maps iframe twice.
const toolsPath = 'lib/browser-nubo-tools-line.ts';
let tools = fs.readFileSync(toolsPath, 'utf8');
if (!tools.includes(MAPS_MARKER)) {
  if (!tools.includes('NUBO_MAPS_CARD_LIST_V3')) {
    throw new Error('maps hotfix: Maps cards V3 must run first');
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

  const singleLoad = `  // Load the heavy Google Maps iframe only once. Browser geolocation is used\n  // for the nearby result list, not for a second iframe navigation.\n  const targetUrl = buildNuboMapsEmbedUrl(query, location, null);\n  holder.frame.src = targetUrl;\n  holder.overlay.style.display = \"block\";\n\n  const position = location ? null : await readBrowserPosition();\n  const serial = ++nuboMapsSearchSerial;`;

  if (!tools.includes(doubleLoad)) {
    throw new Error('maps hotfix: double-load block missing');
  }
  tools = tools.replace(doubleLoad, singleLoad);

  tools = tools.replace(
    'image.loading = index < 3 ? \"eager\" : \"lazy\";',
    'image.loading = index === 0 ? \"eager\" : \"lazy\";',
  );
  tools = tools.replace(
    '    holder.listBody.replaceChildren();\n',
    '    holder.listBody.replaceChildren();\n    holder.listBody.style.contain = \"content\";\n    holder.listBody.style.scrollBehavior = \"auto\";\n',
  );

  if (!tools.includes('limit: 20,\n        radiusMeters: 5000,')) {
    throw new Error('maps hotfix: frontend 20-place request missing');
  }
  if (!tools.includes(MAPS_MARKER)) {
    throw new Error('maps hotfix: marker missing');
  }

  fs.writeFileSync(toolsPath, tools);
}

console.log('Applied video-first YouTube UI and smooth 20-place Maps hotfix');
