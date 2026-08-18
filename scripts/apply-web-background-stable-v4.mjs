import fs from 'node:fs';

const mobilePath = 'lib/mobile-direct-app-v4.ts';
let source = fs.readFileSync(mobilePath, 'utf8');

if (!source.includes('NUBO_WEB_BACKGROUND_STABLE_V6')) {
  const helperAnchor = `function openInSeparateContext(url: string, targetName: string) {`;
  const helpers = `// NUBO_WEB_BACKGROUND_STABLE_V6\n// Browser-only external launch contract:\n// - NEVER navigate the active NUBO tab.\n// - Every voice launch gets a fresh external browsing context.\n// - Android intent:// may launch an installed app, but only from that external context.\n// - If a popup/new context is blocked, report blocked; never fall back to window.location.\nfunction isNativeNuboRuntime() {\n  if (typeof window === \"undefined\") return false;\n  const bridge = (window as NuboNativeWindow).NuboNative;\n  if (!bridge) return false;\n  try {\n    return bridge.isNativeApp?.() === true;\n  } catch {\n    return false;\n  }\n}\n\nfunction androidWebIntent(\n  intentPath: string,\n  scheme: string,\n  packageName: string,\n  fallbackUrl: string,\n) {\n  return (\n    \`intent://\${intentPath}\` +\n    \`#Intent;scheme=\${scheme};package=\${packageName};\` +\n    \`S.browser_fallback_url=\${encodeURIComponent(fallbackUrl)};end\`\n  );\n}\n\nfunction openFreshExternalContext(url: string, label: string) {\n  const targetName =\n    \`nubo_external_\${Date.now()}_\${Math.random().toString(36).slice(2)}\`;\n\n  try {\n    const external = window.open(url, targetName, \"noopener,noreferrer\");\n    if (!external) return false;\n    try { external.opener = null; } catch {}\n    return true;\n  } catch {\n    return false;\n  }\n}\n\nfunction launchWebBackgroundV6(\n  targetUrl: string,\n  label: string,\n  preferMusic: boolean,\n) {\n  if (typeof window === \"undefined\" || !isAndroid() || isNativeNuboRuntime()) {\n    return null;\n  }\n\n  const normalizedLabel = label.toLowerCase();\n  const normalizedUrl = targetUrl.toLowerCase();\n  let launchUrl = targetUrl;\n  let mode = \"web-background-fresh-tab\";\n\n  if (isYouTubeUrl(targetUrl)) {\n    const videoId = extractYouTubeVideoId(targetUrl);\n    if (preferMusic) {\n      const intentPath = videoId\n        ? \`music.youtube.com/watch?v=\${encodeURIComponent(videoId)}\`\n        : \"music.youtube.com/\";\n      launchUrl = androidWebIntent(\n        intentPath,\n        \"https\",\n        \"com.google.android.apps.youtube.music\",\n        targetUrl,\n      );\n    } else {\n      const intentPath = videoId\n        ? \`www.youtube.com/watch?v=\${encodeURIComponent(videoId)}\`\n        : \"www.youtube.com/\";\n      launchUrl = androidWebIntent(\n        intentPath,\n        \"https\",\n        \"com.google.android.youtube\",\n        targetUrl,\n      );\n    }\n    mode = \"web-background-fresh-youtube-intent\";\n  } else if (\n    normalizedLabel === \"facebook\" ||\n    normalizedUrl.includes(\"facebook.com\") ||\n    normalizedUrl.includes(\"fb.com\")\n  ) {\n    launchUrl = androidWebIntent(\n      \"www.facebook.com/\",\n      \"https\",\n      \"com.facebook.katana\",\n      targetUrl,\n    );\n    mode = \"web-background-fresh-facebook-intent\";\n  } else if (\n    normalizedLabel === \"instagram\" ||\n    normalizedUrl.includes(\"instagram.com\")\n  ) {\n    launchUrl = androidWebIntent(\n      \"instagram.com/\",\n      \"https\",\n      \"com.instagram.android\",\n      targetUrl,\n    );\n    mode = \"web-background-fresh-instagram-intent\";\n  } else if (\n    normalizedLabel === \"line\" ||\n    normalizedUrl.includes(\"line.me/\")\n  ) {\n    launchUrl = androidWebIntent(\n      \"nv/chat\",\n      \"line\",\n      \"jp.naver.line.android\",\n      targetUrl,\n    );\n    mode = \"web-background-fresh-line-intent\";\n  }\n\n  const opened = openFreshExternalContext(launchUrl, label);\n  return {\n    opened,\n    mode: opened ? mode : \"web-background-popup-blocked\",\n    launchedUrl: opened ? launchUrl : \"\",\n    fallbackUrl: targetUrl,\n    label,\n  };\n}\n\n`;

  if (!source.includes(helperAnchor)) {
    throw new Error('web background stable: helper anchor missing');
  }
  source = source.replace(helperAnchor, helpers + helperAnchor);

  const routeAnchor = `  const youtube = isYouTubeUrl(targetUrl);\n\n  if (youtube) {`;
  const routePatch = `  const youtube = isYouTubeUrl(targetUrl);\n\n  // Pure Android browser path. Never navigate NUBO's own tab.\n  // APK/WebView runtimes bypass this block and keep their native bridge behavior.\n  const webBackgroundLaunch = launchWebBackgroundV6(\n    targetUrl,\n    label,\n    preferMusic,\n  );\n  if (webBackgroundLaunch) {\n    return {\n      ...(result as Record<string, unknown>),\n      mobileUrl: undefined,\n      playerUrl: undefined,\n      autoOpen: false,\n      opened: webBackgroundLaunch.opened,\n      mode: webBackgroundLaunch.mode,\n      externalTab: webBackgroundLaunch.opened,\n      nativeBridge: false,\n      forcedSameTab: false,\n      preserveNubo: true,\n      launchedUrl: webBackgroundLaunch.launchedUrl,\n      fallbackUrl: webBackgroundLaunch.fallbackUrl,\n      mobileLabel: label,\n      launchBlocked: !webBackgroundLaunch.opened,\n      build: \"web-background-stable-v6-20260819\",\n    };\n  }\n\n  if (youtube) {`;

  if (!source.includes(routeAnchor)) {
    throw new Error('web background stable: route anchor missing');
  }
  source = source.replace(routeAnchor, routePatch);
}

fs.writeFileSync(mobilePath, source);

// IMPORTANT: executeBaseTool() runs before forceDirectMobileOpen(). Historically
// openClientUrl() could replace NUBO with window.location.assign() before the
// background launcher ever saw the result. On mobile web, base tools now only
// return the resolved URL; the V6 launcher above is the sole navigation owner.
const basePath = 'lib/browser-nubo-tools.ts';
let base = fs.readFileSync(basePath, 'utf8');
if (!base.includes('NUBO_WEB_BACKGROUND_BASE_DEFER_V6')) {
  const openAnchor = `function openClientUrl(url: string) {\n  if (typeof window === \"undefined\") {`;
  const openPatch = `function openClientUrl(url: string) {\n  // NUBO_WEB_BACKGROUND_BASE_DEFER_V6\n  // Mobile browser navigation is deferred to mobile-direct-app-v4.ts so the\n  // active NUBO tab can never be replaced before the background launcher runs.\n  if (typeof window !== \"undefined\" && isMobileWebClient()) {\n    window.localStorage.setItem(\"nubo_voice_auto_resume_v1\", \"true\");\n    window.localStorage.setItem(\"nubo_external_app_return_v1\", \"true\");\n    return { opened: false, url, mode: \"deferred-mobile-background-launch\" };\n  }\n\n  if (typeof window === \"undefined\") {`;
  if (!base.includes(openAnchor)) {
    throw new Error('web background stable: base openClientUrl anchor missing');
  }
  base = base.replace(openAnchor, openPatch);

  const dangerous = `  window.location.assign(url);\n\n  return {\n    opened: true,\n    url,\n    mode: \"same-tab\",\n  };`;
  const safe = `  // Never sacrifice the NUBO control page when a popup is blocked.\n  return {\n    opened: false,\n    url,\n    mode: \"popup-blocked-preserve-nubo\",\n  };`;
  if (!base.includes(dangerous)) {
    throw new Error('web background stable: dangerous same-tab fallback missing');
  }
  base = base.replace(dangerous, safe);
}
fs.writeFileSync(basePath, base);

console.log('Applied NUBO Web Background Stable V6: single navigation owner + never replace NUBO');
