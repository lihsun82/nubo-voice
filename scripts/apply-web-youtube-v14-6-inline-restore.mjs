import fs from 'node:fs';

const toolsPath = 'lib/browser-nubo-tools-line.ts';
let source = fs.readFileSync(toolsPath, 'utf8');

if (!source.includes('NUBO_WEB_YOUTUBE_V14_6_INLINE_RESTORE')) {
  const normalizeAnchor = `function normalizeAppName(value: unknown) {\n  return String(value ?? \"\")\n    .trim()\n    .toLowerCase()\n    .replace(/[\\s_-]+/g, \"\");\n}\n`;

  const helpers = `${normalizeAnchor}\n// NUBO_WEB_YOUTUBE_V14_6_INLINE_RESTORE\n// Restore only the browser YouTube playback behavior from High Fidelity Music V14.6.\n// Native APK/WebView keeps its existing native/external routing.\nfunction isPureWebInlineMusicClient() {\n  if (typeof window === \"undefined\" || typeof navigator === \"undefined\") {\n    return false;\n  }\n\n  try {\n    const nativeBridge = (window as typeof window & {\n      NuboNative?: { isNativeApp?: () => boolean };\n    }).NuboNative;\n    if (nativeBridge?.isNativeApp?.() === true) return false;\n  } catch {}\n\n  return (\n    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || \"\") ||\n    window.matchMedia(\"(pointer: coarse) and (max-width: 1100px)\").matches\n  );\n}\n\nfunction playYouTubeInsideNuboV146(result: unknown) {\n  if (!result || typeof result !== \"object\") return result;\n\n  const payload = result as {\n    videoId?: unknown;\n    title?: unknown;\n    channelTitle?: unknown;\n  };\n\n  const videoId = String(payload.videoId ?? \"\").trim();\n  if (!videoId) return result;\n\n  const title = String(payload.title ?? \"正在播放\").trim() || \"正在播放\";\n  const channelTitle = String(payload.channelTitle ?? \"\").trim();\n\n  window.dispatchEvent(\n    new CustomEvent(\"nubo-inline-music-play\", {\n      detail: {\n        videoId,\n        title,\n        channelTitle,\n        requestedAt: Date.now(),\n      },\n    }),\n  );\n\n  return {\n    ...(result as Record<string, unknown>),\n    opened: true,\n    autoOpen: false,\n    inlinePlayback: true,\n    replacedCurrentSong: true,\n    mobileUrl: undefined,\n    playerUrl: undefined,\n    mobileLabel: \"NUBO音樂播放器\",\n    preserveNubo: true,\n    message: \`已在NUBO內切換播放：\${title}\`,\n    build: \"web-youtube-inline-v14-6-restored-20260820\",\n  };\n}\n`;

  if (!source.includes(normalizeAnchor)) {
    throw new Error('V14.6 restore: normalizeAppName anchor missing');
  }
  source = source.replace(normalizeAnchor, helpers);

  const routeAnchor = `    if (routedCall.name === \"open_youtube\") {\n      return forceDirectMobileOpen(\n        ensureExternalYouTubeResult(result),\n        \"open_youtube\",\n      );\n    }`;
  const routePatch = `    if (\n      routedCall.name === \"open_youtube\" &&\n      isPureWebInlineMusicClient()\n    ) {\n      return playYouTubeInsideNuboV146(result);\n    }\n\n    if (routedCall.name === \"open_youtube\") {\n      return forceDirectMobileOpen(\n        ensureExternalYouTubeResult(result),\n        \"open_youtube\",\n      );\n    }`;

  if (!source.includes(routeAnchor)) {
    throw new Error('V14.6 restore: open_youtube route anchor missing');
  }
  source = source.replace(routeAnchor, routePatch);

  source = source.replace(
    '10. open_youtube取得videoId後，直接開啟YouTube App；App無法處理時開啟精確影片網址。不得在NUBO頁面內嵌播放。',
    '10. open_youtube取得videoId後，純網頁手機版在NUBO頁面的V14.6持續播放器播放並直接替換上一首，不離開NUBO；原生App維持既有原生播放／外開路徑。',
  );

  source = source.replace(
    '指定歌曲、歌手、MV、音樂或影片的唯一播放工具。搜尋取得videoId後直接開啟YouTube App；App無法處理時開啟外部精確影片網址。不得在NUBO內嵌播放。service使用youtube。',
    '指定歌曲、歌手、MV、音樂或影片的唯一播放工具。純網頁手機版搜尋取得videoId後在NUBO內的High Fidelity Music V14.6持續播放器播放，新指令直接替換目前歌曲；原生App維持既有原生播放／外開路徑。service使用youtube。',
  );
}

fs.writeFileSync(toolsPath, source);
console.log('Applied web-only High Fidelity Music V14.6 inline YouTube restore; all non-YouTube systems preserved');
