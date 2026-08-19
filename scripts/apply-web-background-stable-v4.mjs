import fs from 'node:fs';

const mobilePath = 'lib/mobile-direct-app-v4.ts';
let source = fs.readFileSync(mobilePath, 'utf8');

if (!source.includes('NUBO_WEB_BACKGROUND_STABLE_V7')) {
  const helperAnchor = `function openInSeparateContext(url: string, targetName: string) {`;
  const helpers = `// NUBO_WEB_BACKGROUND_STABLE_V7\n// Restore the pre-regression pure mobile-web behavior around 988e63b5:\n// - ordinary Chrome/Safari web mode opens external HTTPS pages in another tab/context;\n// - NEVER use Android intent:// from the browser-only path;\n// - NEVER navigate the active NUBO tab;\n// - if the browser blocks a new tab, preserve NUBO and report blocked.\nfunction isNativeNuboRuntime() {\n  if (typeof window === \"undefined\") return false;\n  const bridge = (window as NuboNativeWindow).NuboNative;\n  if (!bridge) return false;\n  try {\n    return bridge.isNativeApp?.() === true;\n  } catch {\n    return false;\n  }\n}\n\nfunction openPureWebExternalTab(url: string, label: string) {\n  // YouTube reuses one player tab so repeated song changes do not create\n  // dozens of tabs. Other sites use their own stable external tab.\n  const normalized = label.toLowerCase();\n  const targetName =\n    normalized.includes(\"youtube\")\n      ? \"nubo_youtube_player\"\n      : normalized.includes(\"facebook\")\n        ? \"nubo_facebook_external\"\n        : normalized.includes(\"instagram\")\n          ? \"nubo_instagram_external\"\n          : \"nubo_mobile_external\";\n\n  try {\n    const external = window.open(url, targetName);\n    if (!external) return false;\n    try {\n      external.opener = null;\n      external.focus();\n    } catch {}\n    return true;\n  } catch {\n    return false;\n  }\n}\n\nfunction launchPureWebBackgroundV7(\n  targetUrl: string,\n  label: string,\n) {\n  if (\n    typeof window === \"undefined\" ||\n    isNativeNuboRuntime()\n  ) {\n    return null;\n  }\n\n  // Browser-only contract: keep navigation as ordinary HTTPS/HTTP.\n  // No app intents and no same-tab fallback.\n  if (!/^https?:\\/\\//i.test(targetUrl)) {\n    return null;\n  }\n\n  const opened = openPureWebExternalTab(targetUrl, label);\n  return {\n    opened,\n    mode: opened\n      ? \"web-background-pure-external-tab\"\n      : \"web-background-popup-blocked\",\n    launchedUrl: opened ? targetUrl : \"\",\n    fallbackUrl: targetUrl,\n    label,\n  };\n}\n\n`;

  if (!source.includes(helperAnchor)) {
    throw new Error('web background V7: helper anchor missing');
  }
  source = source.replace(helperAnchor, helpers + helperAnchor);

  const routeAnchor = `  const youtube = isYouTubeUrl(targetUrl);\n\n  if (youtube) {`;
  const routePatch = `  const youtube = isYouTubeUrl(targetUrl);\n\n  // Pure browser path restored from the pre-same-tab regression behavior.\n  // APK/WebView runtimes bypass this and retain the current native bridge.\n  const pureWebLaunch = launchPureWebBackgroundV7(targetUrl, label);\n  if (pureWebLaunch) {\n    return {\n      ...(result as Record<string, unknown>),\n      mobileUrl: undefined,\n      playerUrl: undefined,\n      autoOpen: false,\n      opened: pureWebLaunch.opened,\n      mode: pureWebLaunch.mode,\n      externalTab: pureWebLaunch.opened,\n      nativeBridge: false,\n      youtubeAppPreferred: false,\n      forcedSameTab: false,\n      preserveNubo: true,\n      launchedUrl: pureWebLaunch.launchedUrl,\n      fallbackUrl: pureWebLaunch.fallbackUrl,\n      mobileLabel: label,\n      launchBlocked: !pureWebLaunch.opened,\n      singleLaunchOwner: \"pure-web-external-tab-v7\",\n      build: \"web-background-stable-v7-988e63b5-20260819\",\n    };\n  }\n\n  if (youtube) {`;

  if (!source.includes(routeAnchor)) {
    throw new Error('web background V7: route anchor missing');
  }
  source = source.replace(routeAnchor, routePatch);
}

fs.writeFileSync(mobilePath, source);

// executeBaseTool() runs before forceDirectMobileOpen(). On mobile web the base
// layer must only resolve URLs; navigation belongs exclusively to the V7 launcher.
const basePath = 'lib/browser-nubo-tools.ts';
let base = fs.readFileSync(basePath, 'utf8');
if (!base.includes('NUBO_WEB_BACKGROUND_BASE_DEFER_V7')) {
  const openAnchor = `function openClientUrl(url: string) {\n  if (typeof window === \"undefined\") {`;
  const openPatch = `function openClientUrl(url: string) {\n  // NUBO_WEB_BACKGROUND_BASE_DEFER_V7\n  // Mobile browser tools resolve only; never navigate NUBO's current page.\n  if (typeof window !== \"undefined\" && isMobileWebClient()) {\n    window.localStorage.setItem(\"nubo_voice_auto_resume_v1\", \"true\");\n    return { opened: false, url, mode: \"deferred-pure-web-external-tab\" };\n  }\n\n  if (typeof window === \"undefined\") {`;
  if (!base.includes(openAnchor)) {
    throw new Error('web background V7: base openClientUrl anchor missing');
  }
  base = base.replace(openAnchor, openPatch);

  const dangerous = `  window.location.assign(url);\n\n  return {\n    opened: true,\n    url,\n    mode: \"same-tab\",\n  };`;
  const safe = `  // V7: popup failure must never replace the NUBO control page.\n  return {\n    opened: false,\n    url,\n    mode: \"popup-blocked-preserve-nubo\",\n  };`;
  if (base.includes(dangerous)) {
    base = base.replace(dangerous, safe);
  }
}
fs.writeFileSync(basePath, base);

console.log('Applied NUBO Web Background Stable V7: pure HTTPS external-tab mode; no intent and no same-tab fallback');
