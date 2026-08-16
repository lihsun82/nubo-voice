const fs = require('fs');

const path = 'lib/browser-nubo-tools.ts';
const before = fs.readFileSync(path, 'utf8');

const oldBlock = `    if (isMobileWebClient()) {\n      return {\n        ...openClientUrl(url),\n        provider: \"Google Maps\",\n        query,\n        location:\n          location || \"目前位置\",\n      };\n    }`;

const oldV601BlockStart = '      // NUBO_V60_MAPS_BACKGROUND_VOICE';

const newBlock = `    if (isMobileWebClient()) {\n      // NUBO_V60_2_MAPS_WEB_OVERLAY\n      // Keep NUBO alive underneath while a full-screen Google Maps web layer\n      // is shown in the same Android Activity. Every later place request simply\n      // reloads that same map layer, so there is no PiP and no app switching.\n      try {\n        const nativeBridge = (window as typeof window & {\n          NuboNative?: {\n            showMapsWeb?: (targetUrl: string) => boolean;\n          };\n        }).NuboNative;\n\n        if (nativeBridge?.showMapsWeb?.(url)) {\n          return {\n            opened: true,\n            url,\n            mode: \"native-maps-web-overlay\",\n            provider: \"Google Maps\",\n            query,\n            location: location || \"目前位置\",\n            nuboVoiceKeepAlive: true,\n            mapsOverlay: true,\n          };\n        }\n      } catch {\n        // Preserve the exact V60 browser fallback if native overlay is unavailable.\n      }\n\n      return {\n        ...openClientUrl(url),\n        provider: \"Google Maps\",\n        query,\n        location:\n          location || \"目前位置\",\n      };\n    }`;

let after = before;
if (after.includes(oldBlock)) {
  after = after.replace(oldBlock, newBlock);
} else if (after.includes(oldV601BlockStart)) {
  const start = after.indexOf('    if (isMobileWebClient()) {', after.indexOf(oldV601BlockStart) - 40);
  const endNeedle = '\n\n    return post(';
  const end = after.indexOf(endNeedle, start);
  if (start < 0 || end < 0) throw new Error('Could not isolate V60.1 Maps block');
  after = after.slice(0, start) + newBlock + after.slice(end);
} else if (!after.includes('NUBO_V60_2_MAPS_WEB_OVERLAY')) {
  throw new Error('Could not locate V60 search_nearby mobile Google Maps block');
}

for (const token of [
  'NUBO_V60_2_MAPS_WEB_OVERLAY',
  'showMapsWeb?.(url)',
  'mode: "native-maps-web-overlay"',
  'mapsOverlay: true',
  'nuboVoiceKeepAlive: true',
]) {
  if (!after.includes(token)) throw new Error(`Missing V60.2 Maps overlay marker: ${token}`);
}
if (after.includes('mode: "native-pip-keepalive"')) {
  throw new Error('Old PiP Maps route must not remain in V60.2');
}

if (after !== before) {
  fs.writeFileSync(path, after);
  console.log('Applied V60.2 full-screen Maps web overlay route');
} else {
  console.log('V60.2 Maps overlay already applied');
}
