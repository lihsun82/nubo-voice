const fs = require('fs');

const path = 'lib/browser-nubo-tools.ts';
const before = fs.readFileSync(path, 'utf8');

const oldBlock = `    if (isMobileWebClient()) {\n      return {\n        ...openClientUrl(url),\n        provider: \"Google Maps\",\n        query,\n        location:\n          location || \"目前位置\",\n      };\n    }`;

const newBlock = `    if (isMobileWebClient()) {\n      // NUBO_V60_MAPS_BACKGROUND_VOICE\n      // V60 Android already owns a PiP/voice keep-alive bridge.\n      // Use it only for Google Maps so the live NUBO conversation stays active\n      // while Maps is foregrounded and the user can immediately request another place.\n      try {\n        const nativeBridge = (window as typeof window & {\n          NuboNative?: {\n            openExternalApp?: (targetUrl: string, label: string) => boolean;\n          };\n        }).NuboNative;\n\n        if (nativeBridge?.openExternalApp?.(url, \"Google Maps\")) {\n          return {\n            opened: true,\n            url,\n            mode: \"native-pip-keepalive\",\n            provider: \"Google Maps\",\n            query,\n            location: location || \"目前位置\",\n            nuboVoiceKeepAlive: true,\n          };\n        }\n      } catch {\n        // Keep the exact V60 browser fallback if the native bridge is unavailable.\n      }\n\n      return {\n        ...openClientUrl(url),\n        provider: \"Google Maps\",\n        query,\n        location:\n          location || \"目前位置\",\n      };\n    }`;

let after = before;
if (after.includes(oldBlock)) {
  after = after.replace(oldBlock, newBlock);
} else if (!after.includes('NUBO_V60_MAPS_BACKGROUND_VOICE')) {
  throw new Error('Could not locate V60 search_nearby mobile Google Maps block');
}

for (const token of [
  'NUBO_V60_MAPS_BACKGROUND_VOICE',
  'openExternalApp?.(url, "Google Maps")',
  'mode: "native-pip-keepalive"',
  'nuboVoiceKeepAlive: true',
]) {
  if (!after.includes(token)) throw new Error(`Missing V60 Maps background voice marker: ${token}`);
}

if (after !== before) {
  fs.writeFileSync(path, after);
  console.log('Applied V60 Maps background voice keep-alive');
} else {
  console.log('V60 Maps background voice already applied');
}
