const fs = require('fs');

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`[v72] no-op ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[v72] patched ${path}`);
}

// V72 changes YouTube only. Preserve the V71 Maps keep-alive and every other route.
// V64's YouTube contract is the V58 same-Activity bottom 16:9 embedded player,
// with the V63 intent guard already applied. Ensure YouTube never escapes through window.open.
patch('components/GeminiVoiceConsole.tsx', (source) => {
  let s = source;

  if (!s.includes('NUBO_V71_YOUTUBE_V66_EMBED_ROUTE')) {
    throw new Error('V72 requires the current V71 embedded YouTube routing baseline');
  }

  s = s.replaceAll('NUBO_V71_YOUTUBE_V66_EMBED_ROUTE', 'NUBO_V72_YOUTUBE_V64_BANNER_ROUTE');
  s = s.replace(
    '// V66 Android embeds exact YouTube videos at the bottom of the\n                        // NUBO Activity when navigation reaches the native WebView client.',
    '// V64 YouTube contract: exact videos stay inside the NUBO Activity as the\n                        // native bottom 16:9 banner when navigation reaches the WebView client.',
  );

  if (!s.includes('call.name === "open_youtube"')) throw new Error('V72 YouTube routing gate missing');
  if (!s.includes('NUBO_V72_YOUTUBE_V64_BANNER_ROUTE')) throw new Error('V72 marker missing');
  return s;
});

console.log('Applied V72 web: YouTube-only V64 bottom-banner routing contract');
