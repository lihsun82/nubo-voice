import fs from 'node:fs';

const path = 'components/NuboInlineMusicPlayer.tsx';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes('NUBO_YOUTUBE_RESILIENT_V2')) {
  source = source.replace(
    'const AUTO_RECOVERY_DELAYS = [0, 120, 350, 800, 1500, 3000, 6000, 10000, 15000];',
    '// NUBO_YOUTUBE_RESILIENT_V2\nconst AUTO_RECOVERY_DELAYS = [0, 300, 1000, 2600, 6500];',
  );
  source = source.replace(
    'const SOUND_PROMOTION_DELAYS = [0, 80, 220, 520, 1000, 2000];',
    'const SOUND_PROMOTION_DELAYS = [0, 180, 700, 1800];',
  );
  source = source.replace(
    'const BACKGROUND_RETRY_DELAYS = [500, 1400, 3200, 6500];',
    'const BACKGROUND_RETRY_DELAYS = [800, 2200, 6000];',
  );

  const hookAnchor = `  const clearTimerList = (timers: TimerListRef) => {`;
  const preconnectOnly = `  useEffect(() => {\n    // Only preconnect here. Loading iframe_api before the song effect can race\n    // with onYouTubeIframeAPIReady on mobile browsers and leave the UI stuck\n    // at \"preparing player\". The song effect below owns API loading.\n    for (const href of [\n      \"https://www.youtube.com\",\n      \"https://i.ytimg.com\",\n      \"https://www.googlevideo.com\",\n    ]) {\n      if (document.head.querySelector(\`link[data-nubo-youtube-preconnect=\"\${href}\"]\`)) continue;\n      const link = document.createElement(\"link\");\n      link.rel = \"preconnect\";\n      link.href = href;\n      link.crossOrigin = \"anonymous\";\n      link.dataset.nuboYoutubePreconnect = href;\n      document.head.appendChild(link);\n    }\n  }, []);\n\n${hookAnchor}`;

  if (!source.includes(hookAnchor)) {
    throw new Error('youtube resilient v2: hook anchor missing');
  }
  source = source.replace(hookAnchor, preconnectOnly);

  const readyAnchor = `    const previousReady = youtubeWindow.onYouTubeIframeAPIReady;`;
  const readyPatch = `${readyAnchor}\n    let apiPollTimer: number | null = null;\n    let apiRetryTimer: number | null = null;`;

  if (!source.includes(readyAnchor)) {
    throw new Error('youtube resilient v2: ready anchor missing');
  }
  source = source.replace(readyAnchor, readyPatch);

  const cleanupAnchor = `    return () => {\n      disposed = true;`;
  const resiliencePatch = `    // Do not rely on the global callback alone. Some Android browsers can miss\n    // it when the IFrame API script is cached or already in-flight. Poll until\n    // YT.Player is available, then create the player immediately.\n    apiPollTimer = window.setInterval(() => {\n      if (disposed || playerRef.current) {\n        if (apiPollTimer !== null) {\n          window.clearInterval(apiPollTimer);\n          apiPollTimer = null;\n        }\n        return;\n      }\n\n      if (youtubeWindow.YT?.Player) {\n        createPlayer();\n        if (playerRef.current && apiPollTimer !== null) {\n          window.clearInterval(apiPollTimer);\n          apiPollTimer = null;\n        }\n      }\n    }, 200);\n\n    // If iframe_api never becomes usable, reload it once. This recovers from\n    // stale/cancelled script loads without requiring the user to refresh NUBO.\n    apiRetryTimer = window.setTimeout(() => {\n      if (disposed || playerRef.current || youtubeWindow.YT?.Player) return;\n\n      const existing = document.querySelector<HTMLScriptElement>(\n        'script[src=\"https://www.youtube.com/iframe_api\"]',\n      );\n      existing?.remove();\n\n      const retryScript = document.createElement(\"script\");\n      retryScript.src = \"https://www.youtube.com/iframe_api\";\n      retryScript.async = true;\n      retryScript.onerror = () => {\n        if (!disposed) setStatus(\"YouTube 連線失敗，正在等待重新連線…\");\n      };\n      document.head.appendChild(retryScript);\n      setStatus(\"正在重新連線 YouTube 播放器…\");\n    }, 3500);\n\n    return () => {\n      if (apiPollTimer !== null) window.clearInterval(apiPollTimer);\n      if (apiRetryTimer !== null) window.clearTimeout(apiRetryTimer);\n      disposed = true;`;

  if (!source.includes(cleanupAnchor)) {
    throw new Error('youtube resilient v2: cleanup anchor missing');
  }
  source = source.replace(cleanupAnchor, resiliencePatch);

  for (const token of [
    'NUBO_YOUTUBE_RESILIENT_V2',
    'https://www.googlevideo.com',
    'apiPollTimer = window.setInterval',
    '正在重新連線 YouTube 播放器',
    'const AUTO_RECOVERY_DELAYS = [0, 300, 1000, 2600, 6500];',
  ]) {
    if (!source.includes(token)) throw new Error(`youtube resilient v2 missing ${token}`);
  }

  fs.writeFileSync(path, source);
}

console.log('Applied resilient YouTube player initialization and smoother retries');
