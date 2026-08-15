const fs = require('fs');

function patch(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`[v71] no-op ${path}`);
    return;
  }
  fs.writeFileSync(path, after);
  console.log(`[v71] patched ${path}`);
}

// 1) Restore V66-style native embedded YouTube route only.
patch('components/GeminiVoiceConsole.tsx', (source) => {
  let s = source;

  const oldOpen = `                        const opened =\n                          window.open(\n                            targetUrl,\n                            "nubo_mobile_external",\n                          );`;

  const newOpen = `                        // NUBO_V71_YOUTUBE_V66_EMBED_ROUTE\n                        // V66 Android embeds exact YouTube videos at the bottom of the\n                        // NUBO Activity when navigation reaches the native WebView client.\n                        // Do not let window.open() bypass that interceptor for YouTube.\n                        const opened =\n                          call.name === "open_youtube"\n                            ? null\n                            : window.open(\n                                targetUrl,\n                                "nubo_mobile_external",\n                              );`;

  if (s.includes(oldOpen)) {
    s = s.replace(oldOpen, newOpen);
  } else if (!s.includes('NUBO_V71_YOUTUBE_V66_EMBED_ROUTE')) {
    throw new Error('V71 could not locate mobile external window.open route');
  }

  if (!s.includes('NUBO_V71_YOUTUBE_V66_EMBED_ROUTE')) throw new Error('V71 YouTube route marker missing');
  return s;
});

// 2) For nearby Google Maps only, invoke the existing native keep-alive/PiP bridge
// before Maps is foregrounded. Leave the V33 search query/location behavior unchanged.
patch('lib/browser-nubo-tools.ts', (source) => {
  let s = source;

  const oldBlock = `    if (isMobileWebClient()) {\n      return {\n        ...openClientUrl(url),\n        provider: "Google Maps",\n        query,\n        location:\n          location || "目前位置",\n      };\n    }`;

  const newBlock = `    if (isMobileWebClient()) {\n      // NUBO_V71_MAPS_BACKGROUND_VOICE_KEEPALIVE\n      // Use the existing Android native bridge so NUBO enters PiP/keep-alive\n      // before Google Maps takes foreground. This keeps Gemini/WebView voice alive.\n      try {\n        const nativeBridge = (window as typeof window & {\n          NuboNative?: {\n            openExternalApp?: (targetUrl: string, label: string) => boolean;\n          };\n        }).NuboNative;\n\n        if (nativeBridge?.openExternalApp?.(url, "Google Maps")) {\n          return {\n            opened: true,\n            url,\n            mode: "native-pip-keepalive",\n            provider: "Google Maps",\n            query,\n            location: location || "目前位置",\n            nuboVoiceKeepAlive: true,\n          };\n        }\n      } catch {\n        // Fall through to the exact V33 browser Maps behavior.\n      }\n\n      return {\n        ...openClientUrl(url),\n        provider: "Google Maps",\n        query,\n        location:\n          location || "目前位置",\n      };\n    }`;

  if (s.includes(oldBlock)) {
    s = s.replace(oldBlock, newBlock);
  } else if (!s.includes('NUBO_V71_MAPS_BACKGROUND_VOICE_KEEPALIVE')) {
    throw new Error('V71 could not locate V33 search_nearby mobile block');
  }

  if (!s.includes('NUBO_MOBILE_PLACES_V1')) throw new Error('V33 Maps rules must remain');
  if (!s.includes('NUBO_V71_MAPS_BACKGROUND_VOICE_KEEPALIVE')) throw new Error('V71 Maps keepalive marker missing');
  if (!s.includes('provider: "Google Maps"')) throw new Error('Google Maps provider missing');
  return s;
});

console.log('Applied V71 web: V66 YouTube embedded route + Maps native voice keep-alive only');
