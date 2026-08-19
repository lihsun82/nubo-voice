import fs from 'node:fs';

const toolsPath = 'lib/browser-nubo-tools-line.ts';
let source = fs.readFileSync(toolsPath, 'utf8');

if (!source.includes('NUBO_MAPS_V14_1_RESTORE')) {
  const helperAnchor = `function normalizeAppName(value: unknown) {`;
  const helpers = `// NUBO_MAPS_V14_1_RESTORE\n// Restore the proven External Web Tab V14.1 behavior only for pure mobile-web\n// Google Maps launches. APK/WebView and every non-Maps tool keep current behavior.\nconst V14_1_MAP_APP_NAMES = new Set([\n  \"maps\",\n  \"googlemaps\",\n  \"地圖\",\n  \"google地圖\",\n]);\n\nfunction isPureWebNuboRuntime() {\n  if (typeof window === \"undefined\" || typeof navigator === \"undefined\") return false;\n  try {\n    const bridge = (window as typeof window & {\n      NuboNative?: { isNativeApp?: () => boolean };\n    }).NuboNative;\n    if (bridge?.isNativeApp?.() === true) return false;\n  } catch {}\n  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || \"\")\n    || window.matchMedia(\"(pointer: coarse) and (max-width: 1100px)\").matches;\n}\n\nfunction buildV14_1MapsUrl(query: unknown) {\n  const text = String(query ?? \"\").trim();\n  return text\n    ? \"https://www.google.com/maps/search/?api=1&query=\" + encodeURIComponent(text)\n    : \"https://www.google.com/maps/\";\n}\n\nfunction tryV14_1MapsWebLaunch(call: FunctionCall) {\n  if (call.name !== \"open_mobile_app\" || !isPureWebNuboRuntime()) return null;\n  const args = call.args ?? {};\n  const app = String(args.app ?? \"\")\n    .trim()\n    .toLowerCase()\n    .replace(/[\\s_-]+/g, \"\");\n  if (!V14_1_MAP_APP_NAMES.has(app)) return null;\n\n  const targetUrl = buildV14_1MapsUrl(args.query);\n  return forceDirectMobileOpen(\n    {\n      ok: true,\n      mobileUrl: targetUrl,\n      mobileLabel: \"Google Maps\",\n      autoOpen: true,\n      supported: true,\n      preserveNubo: true,\n      build: \"maps-external-web-tab-v14-1-restore-20260820\",\n    },\n    \"open_mobile_app\",\n  );\n}\n\n`;

  if (!source.includes(helperAnchor)) {
    throw new Error('maps v14.1 restore: helper anchor missing');
  }
  source = source.replace(helperAnchor, helpers + helperAnchor);

  const executeAnchor = `export async function executeNuboBrowserTool(call: FunctionCall) {`;
  const executePatch = `${executeAnchor}\n  const v14MapsWebResult = tryV14_1MapsWebLaunch(call);\n  if (v14MapsWebResult) return v14MapsWebResult;`;

  if (!source.includes(executeAnchor)) {
    throw new Error('maps v14.1 restore: execute anchor missing');
  }
  source = source.replace(executeAnchor, executePatch);
}

fs.writeFileSync(toolsPath, source);
console.log('Applied Google Maps External Web Tab V14.1 restore only');
