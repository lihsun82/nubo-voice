const fs = require('fs');

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`[v75] no-op ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[v75] patched ${path}`);
}

patch('components/GeminiVoiceConsole.tsx', (source) => {
  let s = source;

  // V75: remove V74 React-owned embedded YouTube state/helper completely.
  const stateStart = s.indexOf('  // NUBO_V74_DOM_YOUTUBE_BANNER');
  const stopMarker = s.indexOf('\n\n  const stopNuboOutput', stateStart >= 0 ? stateStart : 0);
  if (stateStart >= 0 && stopMarker > stateStart) {
    s = s.slice(0, stateStart) + s.slice(stopMarker + 2);
  }

  // V75: replace the V74 inline interception block with a non-intercepting marker.
  const routeStart = s.indexOf('                // NUBO_V74_FORCE_DOM_YOUTUBE_BANNER');
  const mobileMarker = s.indexOf('                // NUBO_MOBILE_APP_AUTO_OPEN_V1', routeStart >= 0 ? routeStart : 0);
  if (routeStart >= 0 && mobileMarker > routeStart) {
    const relay = `                // NUBO_V75_EXTERNAL_COMMAND_RELAY\n                // YouTube is authoritative in the external YouTube app. Every new\n                // song/video command is dispatched again through the native Android\n                // bridge; do not intercept it into a React/native embedded player.\n                const shownInlineYoutube = false;\n\n`;
    s = s.slice(0, routeStart) + relay + s.slice(mobileMarker);
  }

  // V75: remove the V74 fixed iframe JSX block.
  const jsxStart = s.indexOf('      {embeddedYoutube ? (');
  if (jsxStart >= 0) {
    const jsxEndToken = '      ) : null}';
    const jsxEnd = s.indexOf(jsxEndToken, jsxStart);
    if (jsxEnd < 0) throw new Error('V75 could not locate end of V74 embedded YouTube JSX');
    s = s.slice(0, jsxStart) + s.slice(jsxEnd + jsxEndToken.length);
  }

  // Fast route must no longer call the V74 DOM helper.
  s = s.replace(
    /\s*const shown = showYoutubeInNubo\(result, fastYouTubeQuery\);\n\s*setTranscript\(\n\s*shown\n\s*\? `YouTube 已在 NUBO 下方播放：\$\{fastYouTubeQuery\}`\n\s*: `已送出換歌：\$\{fastYouTubeQuery\}`,\n\s*\);/m,
    '\n                    setTranscript(`已送出換歌：${fastYouTubeQuery}`);',
  );

  // Remove V74 guards so normal existing mobile/native external route executes.
  s = s.replace(/\n\s*!shownInlineYoutube &&/g, '');

  if (s.includes('nubo-youtube-banner-v74')) throw new Error('V75 still contains V74 iframe banner');
  if (s.includes('showYoutubeInNubo(')) throw new Error('V75 still contains V74 DOM YouTube helper');
  if (s.includes('setEmbeddedYoutube(')) throw new Error('V75 still contains embedded YouTube state');
  if (!s.includes('NUBO_V75_EXTERNAL_COMMAND_RELAY')) throw new Error('V75 relay marker missing');
  if (!s.includes('NUBO_V70_NO_30S_ECO')) throw new Error('V70 no-eco baseline missing');

  return s;
});

patch('lib/browser-nubo-tools-line.ts', (source) => {
  let s = source;
  if (!s.includes('NUBO_V75_EXTERNAL_APP_COMMAND_RELAY')) {
    s = s.replace(
      'export async function executeNuboBrowserTool(call: FunctionCall) {',
      `// NUBO_V75_EXTERNAL_APP_COMMAND_RELAY\n// YouTube and Maps are external-app command surfaces. Repeated voice commands\n// intentionally dispatch repeated Android intents instead of maintaining an\n// embedded player or in-page map state.\nexport async function executeNuboBrowserTool(call: FunctionCall) {`,
    );
  }

  // Make nearby search follow the same external native relay concept explicitly.
  const oldTail = '  return executeBaseTool(call);\n}';
  const newTail = `  if (call.name === "search_nearby") {\n    const result = await executeBaseTool(call);\n    return forceDirectMobileOpen(result, "search_nearby");\n  }\n\n  return executeBaseTool(call);\n}`;
  if (s.includes(oldTail) && !s.includes('call.name === "search_nearby"')) {
    s = s.replace(oldTail, newTail);
  }

  if (!s.includes('call.name === "search_nearby"')) throw new Error('V75 Maps relay missing');
  if (!s.includes('forceDirectMobileOpen')) throw new Error('V75 external mobile relay helper missing');
  return s;
});

console.log('Applied V75 web: repeated YouTube + Maps commands relay to external apps; no embedded YouTube');
