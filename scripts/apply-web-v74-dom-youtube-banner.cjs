const fs = require('fs');

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`[v74] no-op ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[v74] patched ${path}`);
}

patch('components/GeminiVoiceConsole.tsx', (source) => {
  let s = source;

  const stateNeedle = `  const [mobileYoutube, setMobileYoutube] = useState<{\n    playerUrl: string;\n    title: string;\n  } | null>(null);`;
  const stateReplacement = `${stateNeedle}\n  // NUBO_V74_DOM_YOUTUBE_BANNER\n  // Authoritative YouTube surface: rendered directly inside the NUBO React UI.\n  const [embeddedYoutube, setEmbeddedYoutube] = useState<{\n    videoId: string;\n    title: string;\n  } | null>(null);\n\n  const showYoutubeInNubo = (result: unknown, fallbackTitle = \"YouTube\") => {\n    if (!result || typeof result !== \"object\" || !(\"videoId\" in result)) return false;\n    const rawVideoId = (result as { videoId?: unknown }).videoId;\n    if (typeof rawVideoId !== \"string\") return false;\n    const videoId = rawVideoId.trim();\n    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return false;\n    const rawTitle = (result as { title?: unknown }).title;\n    const title = typeof rawTitle === \"string\" && rawTitle.trim()\n      ? rawTitle.trim()\n      : fallbackTitle;\n    setEmbeddedYoutube({ videoId, title });\n    setMobileYoutube(null);\n    return true;\n  };`;
  if (!s.includes('NUBO_V74_DOM_YOUTUBE_BANNER')) {
    if (!s.includes(stateNeedle)) throw new Error('V74 could not locate mobileYoutube state');
    s = s.replace(stateNeedle, stateReplacement);
  }

  const fastThenOld = `                  .then((result) => {\n                    const current = youtubeFastRouteRef.current;\n                    if (current?.at === startedAt) {\n                      current.result = result;\n                    }\n                    setTranscript(\`已送出換歌：\${fastYouTubeQuery}\`);\n                    notifyNuboVoicePhase(\"listening\");\n                  })`;
  const fastThenNew = `                  .then((result) => {\n                    const current = youtubeFastRouteRef.current;\n                    if (current?.at === startedAt) {\n                      current.result = result;\n                    }\n                    const shown = showYoutubeInNubo(result, fastYouTubeQuery);\n                    setTranscript(\n                      shown\n                        ? \`YouTube 已在 NUBO 下方播放：\${fastYouTubeQuery}\`\n                        : \`已送出換歌：\${fastYouTubeQuery}\`,\n                    );\n                    notifyNuboVoicePhase(\"listening\");\n                  })`;
  if (s.includes(fastThenOld)) {
    s = s.replace(fastThenOld, fastThenNew);
  }

  // Replace V73's native authoritative route with a DOM-only presentation flag.
  // Do NOT push a custom function response here; let the existing response block below
  // keep its original inferred TypeScript shape.
  const v73Start = s.indexOf('                // NUBO_V73_FORCE_NATIVE_YOUTUBE_BANNER');
  const mobileMarker = s.indexOf('                // NUBO_MOBILE_APP_AUTO_OPEN_V1', v73Start >= 0 ? v73Start : 0);
  if (v73Start >= 0 && mobileMarker > v73Start) {
    const domRoute = `                // NUBO_V74_FORCE_DOM_YOUTUBE_BANNER\n                // Exact YouTube videos render directly inside NUBO's React surface.\n                // No native overlay, URL navigation, window.open, or external YouTube app.\n                const shownInlineYoutube =\n                  call.name === \"open_youtube\" &&\n                  showYoutubeInNubo(result, toolQuery || \"YouTube\");\n\n                if (shownInlineYoutube) {\n                  setTranscript(\"YouTube 已在 NUBO 下方播放。\");\n                }\n\n`;
    s = s.slice(0, v73Start) + domRoute + s.slice(mobileMarker);
  } else if (!s.includes('NUBO_V74_FORCE_DOM_YOUTUBE_BANNER')) {
    throw new Error('V74 could not locate V73 YouTube route block');
  }

  // Prevent the existing mobile URL branch from escaping to an external app/window
  // after the exact video has already been rendered in the NUBO DOM banner.
  const mobileIfOld = `                if (\n                  mobileAction &&\n                  typeof mobileAction.mobileUrl ===\n                    \"string\"\n                ) {`;
  const mobileIfNew = `                if (\n                  !shownInlineYoutube &&\n                  mobileAction &&\n                  typeof mobileAction.mobileUrl ===\n                    \"string\"\n                ) {`;
  if (s.includes(mobileIfOld)) {
    s = s.replace(mobileIfOld, mobileIfNew);
  } else if (!s.includes('!shownInlineYoutube &&\n                  mobileAction')) {
    throw new Error('V74 could not gate mobile external YouTube route');
  }

  const fallbackOld = `                } else if (\n                  call.name ===\n                    \"open_youtube\" &&\n                  result &&`;
  const fallbackNew = `                } else if (\n                  !shownInlineYoutube &&\n                  call.name ===\n                    \"open_youtube\" &&\n                  result &&`;
  if (s.includes(fallbackOld)) {
    s = s.replace(fallbackOld, fallbackNew);
  } else if (!s.includes('!shownInlineYoutube &&\n                  call.name ===')) {
    throw new Error('V74 could not gate playerUrl fallback');
  }

  const jsxOld = `      {mobileYoutube ? (\n        <a\n          className=\"primary mobile-youtube-action\"\n          href={mobileYoutube.playerUrl}\n          target=\"_blank\"\n          rel=\"noreferrer\"\n          onClick={() => setMobileYoutube(null)}\n        >\n          {\"開啟：\"}\n          {mobileYoutube.title}\n        </a>\n      ) : null}`;
  const jsxNew = `      {embeddedYoutube ? (\n        <div\n          className=\"nubo-youtube-banner-v74\"\n          style={{\n            position: \"fixed\",\n            left: 0,\n            right: 0,\n            bottom: 0,\n            width: \"100%\",\n            aspectRatio: \"16 / 9\",\n            maxHeight: \"46vh\",\n            background: \"#000\",\n            zIndex: 2147483000,\n            overflow: \"hidden\",\n            boxShadow: \"0 -8px 28px rgba(0,0,0,.55)\",\n          }}\n          aria-label={\`YouTube：\${embeddedYoutube.title}\`}\n        >\n          <iframe\n            key={embeddedYoutube.videoId}\n            src={\`https://www.youtube.com/embed/\${embeddedYoutube.videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=https%3A%2F%2Fnubo.ainubo.com\`}\n            title={embeddedYoutube.title}\n            allow=\"autoplay; encrypted-media; picture-in-picture\"\n            allowFullScreen\n            referrerPolicy=\"strict-origin-when-cross-origin\"\n            style={{\n              display: \"block\",\n              width: \"100%\",\n              height: \"100%\",\n              border: 0,\n              background: \"#000\",\n            }}\n          />\n          <button\n            type=\"button\"\n            aria-label=\"關閉 YouTube\"\n            onClick={() => setEmbeddedYoutube(null)}\n            style={{\n              position: \"absolute\",\n              top: 8,\n              right: 8,\n              width: 38,\n              height: 38,\n              borderRadius: 19,\n              border: \"1px solid rgba(255,255,255,.4)\",\n              background: \"rgba(0,0,0,.72)\",\n              color: \"#fff\",\n              fontSize: 24,\n              lineHeight: \"34px\",\n              zIndex: 2,\n            }}\n          >\n            ×\n          </button>\n        </div>\n      ) : null}`;
  if (s.includes(jsxOld)) {
    s = s.replace(jsxOld, jsxNew);
  } else if (!s.includes('nubo-youtube-banner-v74')) {
    throw new Error('V74 could not locate old mobile YouTube action JSX');
  }

  for (const token of [
    'NUBO_V74_DOM_YOUTUBE_BANNER',
    'NUBO_V74_FORCE_DOM_YOUTUBE_BANNER',
    'nubo-youtube-banner-v74',
    'https://www.youtube.com/embed/',
    'aspectRatio: "16 / 9"',
    'position: "fixed"',
    'bottom: 0',
    'showYoutubeInNubo(result',
    'setEmbeddedYoutube({ videoId, title })',
    'const shownInlineYoutube =',
    '!shownInlineYoutube &&',
  ]) {
    if (!s.includes(token)) throw new Error(`V74 missing marker: ${token}`);
  }

  return s;
});

console.log('Applied V74 web: YouTube rendered directly as a fixed bottom 16:9 NUBO DOM banner');
