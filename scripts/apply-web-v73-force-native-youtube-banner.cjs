const fs = require('fs');

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`[v73] no-op ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[v73] patched ${path}`);
}

// YouTube-only hard route: once /api/youtube/open returns an exact videoId,
// call the Android embedded-player bridge directly. Do not depend on URL navigation
// or window.open/WebView interception to create the banner.
patch('components/GeminiVoiceConsole.tsx', (source) => {
  let s = source;

  const marker = `                // NUBO_MOBILE_APP_AUTO_OPEN_V1\n                const mobileAction =`;
  const injected = `                // NUBO_V73_FORCE_NATIVE_YOUTUBE_BANNER\n                if (\n                  call.name === "open_youtube" &&\n                  result &&\n                  typeof result === "object" &&\n                  "videoId" in result &&\n                  typeof (result as { videoId?: unknown }).videoId === "string"\n                ) {\n                  const exactVideoId = String((result as { videoId: string }).videoId).trim();\n                  try {\n                    const nativeBridge = (window as typeof window & {\n                      NuboNative?: { playEmbeddedYouTube?: (videoId: string) => boolean };\n                    }).NuboNative;\n                    if (exactVideoId && nativeBridge?.playEmbeddedYouTube?.(exactVideoId)) {\n                      setMobileYoutube(null);\n                      setTranscript("YouTube 已在 NUBO 下方播放。 ");\n                      functionResponses.push({\n                        id: call.id,\n                        name: call.name,\n                        response: { result: { ...result, embeddedInNubo: true, mode: "native-v64-bottom-banner" } },\n                      });\n                      continue;\n                    }\n                  } catch {}\n                }\n\n                // NUBO_MOBILE_APP_AUTO_OPEN_V1\n                const mobileAction =`;

  if (!s.includes('NUBO_V73_FORCE_NATIVE_YOUTUBE_BANNER')) {
    if (!s.includes(marker)) throw new Error('V73 could not locate mobile action block');
    s = s.replace(marker, injected);
  }

  if (!s.includes('playEmbeddedYouTube?.(exactVideoId)')) throw new Error('V73 native YouTube bridge call missing');
  if (!s.includes('native-v64-bottom-banner')) throw new Error('V73 embedded mode marker missing');
  return s;
});

console.log('Applied V73 web: force exact YouTube videoId through native V64 bottom banner');
