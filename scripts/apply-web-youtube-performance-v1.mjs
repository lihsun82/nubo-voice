import fs from 'node:fs';

const path = 'components/NuboInlineMusicPlayer.tsx';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes('NUBO_YOUTUBE_SMOOTH_V1')) {
  source = source.replace(
    'const AUTO_RECOVERY_DELAYS = [0, 120, 350, 800, 1500, 3000, 6000, 10000, 15000];',
    '// NUBO_YOUTUBE_SMOOTH_V1\nconst AUTO_RECOVERY_DELAYS = [0, 300, 1000, 2600, 6500];',
  );
  source = source.replace(
    'const SOUND_PROMOTION_DELAYS = [0, 80, 220, 520, 1000, 2000];',
    'const SOUND_PROMOTION_DELAYS = [0, 180, 700, 1800];',
  );
  source = source.replace(
    'const BACKGROUND_RETRY_DELAYS = [500, 1400, 3200, 6500];',
    'const BACKGROUND_RETRY_DELAYS = [800, 2200, 6000];',
  );

  const anchor = `  const clearTimerList = (timers: TimerListRef) => {`;
  const prewarm = `  useEffect(() => {\n    // Preconnect before the first song so the IFrame API and video CDN do not\n    // start from a cold connection when the user asks for music.\n    for (const href of [\n      \"https://www.youtube.com\",\n      \"https://i.ytimg.com\",\n      \"https://www.googlevideo.com\",\n    ]) {\n      if (document.head.querySelector(\`link[data-nubo-youtube-preconnect=\"\${href}\"]\`)) continue;\n      const link = document.createElement(\"link\");\n      link.rel = \"preconnect\";\n      link.href = href;\n      link.crossOrigin = \"anonymous\";\n      link.dataset.nuboYoutubePreconnect = href;\n      document.head.appendChild(link);\n    }\n\n    const host = window as unknown as YouTubeApiHost;\n    if (host.YT?.Player) return;\n    if (!document.querySelector('script[src=\"https://www.youtube.com/iframe_api\"]')) {\n      const script = document.createElement(\"script\");\n      script.src = \"https://www.youtube.com/iframe_api\";\n      script.async = true;\n      document.head.appendChild(script);\n    }\n  }, []);\n\n${anchor}`;

  if (!source.includes(anchor)) {
    throw new Error('youtube smooth v1: hook anchor missing');
  }
  source = source.replace(anchor, prewarm);

  for (const token of [
    'NUBO_YOUTUBE_SMOOTH_V1',
    'https://www.googlevideo.com',
    'const AUTO_RECOVERY_DELAYS = [0, 300, 1000, 2600, 6500];',
  ]) {
    if (!source.includes(token)) throw new Error(`youtube smooth v1 missing ${token}`);
  }

  fs.writeFileSync(path, source);
}

console.log('Applied smoother YouTube retries and player prewarm');
