import fs from 'node:fs';

const componentPath = 'components/NuboInlineMusicPlayer.tsx';
const cssPath = 'app/inline-music-v13.css';
const marker = 'NUBO_YOUTUBE_REAL_SIZE_V5';

let source = fs.readFileSync(componentPath, 'utf8');

if (!source.includes(marker)) {
  source = source.replace(
    '  setVolume: (volume: number) => void;\n  getPlayerState: () => number;',
    '  setVolume: (volume: number) => void;\n  setSize: (width: number, height: number) => void;\n  getPlayerState: () => number;',
  );

  source = source.replace(
    '  const playerRef = useRef<YouTubePlayer | null>(null);',
    '  const playerRef = useRef<YouTubePlayer | null>(null);\n  const frameRef = useRef<HTMLDivElement | null>(null);',
  );

  source = source.replace(
    '  const clearBackgroundRetries = () => clearTimerList(backgroundTimersRef);',
    `  const clearBackgroundRetries = () => clearTimerList(backgroundTimersRef);\n\n  // ${marker}: YouTube officially exposes player.setSize(width, height).\n  // Keep the iframe viewport in real pixels and re-sync whenever the mobile card resizes.\n  const syncPlayerSize = (player = playerRef.current) => {\n    const frame = frameRef.current;\n    if (!player || !frame) return;\n\n    const rect = frame.getBoundingClientRect();\n    const width = Math.max(200, Math.round(rect.width));\n    const height = Math.max(200, Math.round(rect.height));\n\n    try {\n      player.setSize(width, height);\n      const iframe = player.getIframe?.();\n      if (!iframe) return;\n\n      iframe.setAttribute('width', String(width));\n      iframe.setAttribute('height', String(height));\n      iframe.style.setProperty('position', 'absolute', 'important');\n      iframe.style.setProperty('left', '50%', 'important');\n      iframe.style.setProperty('top', '50%', 'important');\n      iframe.style.setProperty('right', 'auto', 'important');\n      iframe.style.setProperty('bottom', 'auto', 'important');\n      iframe.style.setProperty('margin', '0', 'important');\n      iframe.style.setProperty('width', width + 'px', 'important');\n      iframe.style.setProperty('height', height + 'px', 'important');\n      iframe.style.setProperty('max-width', 'none', 'important');\n      iframe.style.setProperty('max-height', 'none', 'important');\n      iframe.style.setProperty('transform', 'translate(-50%, -50%) scale(1.35)', 'important');\n      iframe.style.setProperty('transform-origin', 'center center', 'important');\n      iframe.style.setProperty('display', 'block', 'important');\n      iframe.style.setProperty('border', '0', 'important');\n    } catch {\n      // Player can disappear while switching songs; the next resize/ready event re-syncs it.\n    }\n  };`,
  );

  source = source.replace(
    `      playerRef.current = new youtubeWindow.YT.Player(PLAYER_ELEMENT_ID, {\n        width: \"100%\",\n        height: \"100%\",`,
    `      const frameRect = frameRef.current?.getBoundingClientRect();\n      const initialWidth = Math.max(200, Math.round(frameRect?.width || 320));\n      const initialHeight = Math.max(200, Math.round(frameRect?.height || 200));\n\n      playerRef.current = new youtubeWindow.YT.Player(PLAYER_ELEMENT_ID, {\n        width: initialWidth,\n        height: initialHeight,`,
  );

  source = source.replace(
    `              iframe?.setAttribute(\"tabindex\", \"-1\");\n            } catch {`,
    `              iframe?.setAttribute(\"tabindex\", \"-1\");\n              syncPlayerSize(event.target);\n            } catch {`,
  );

  source = source.replace(
    `  useEffect(() => {\n    if (song) startCurrentSongAutomatically(song);\n  }, [song?.videoId, song?.requestedAt]);`,
    `  useEffect(() => {\n    if (song) startCurrentSongAutomatically(song);\n  }, [song?.videoId, song?.requestedAt]);\n\n  useEffect(() => {\n    if (!song || !frameRef.current) return;\n\n    const frame = frameRef.current;\n    let raf = 0;\n    const scheduleSync = () => {\n      window.cancelAnimationFrame(raf);\n      raf = window.requestAnimationFrame(() => syncPlayerSize());\n    };\n\n    const observer = new ResizeObserver(scheduleSync);\n    observer.observe(frame);\n    window.addEventListener('resize', scheduleSync);\n    scheduleSync();\n\n    return () => {\n      observer.disconnect();\n      window.removeEventListener('resize', scheduleSync);\n      window.cancelAnimationFrame(raf);\n    };\n  }, [Boolean(song)]);`,
  );

  source = source.replace(
    '<div className="nubo-inline-music-frame" aria-hidden="true">',
    '<div ref={frameRef} className="nubo-inline-music-frame" aria-hidden="true">',
  );

  if (!source.includes(marker) || !source.includes('player.setSize(width, height)')) {
    throw new Error('youtube real-size v5 component patch failed');
  }

  fs.writeFileSync(componentPath, source);
}

let css = fs.readFileSync(cssPath, 'utf8');
if (!css.includes(marker)) {
  css += `\n\n/* ${marker}: full-width mobile viewport. Official IFrame API requires at least 200x200. */\n@media (max-width: 680px) {\n  .nubo-inline-music {\n    display: block !important;\n    box-sizing: border-box !important;\n    padding: 8px !important;\n  }\n\n  .nubo-inline-music-frame {\n    position: relative !important;\n    width: 100% !important;\n    min-width: 0 !important;\n    height: max(200px, min(240px, calc((100vw - 34px) * 0.5625))) !important;\n    aspect-ratio: auto !important;\n    overflow: hidden !important;\n    background: #000 !important;\n    border-radius: 12px !important;\n  }\n\n  .nubo-inline-music-frame > div {\n    position: absolute !important;\n    inset: 0 !important;\n    width: 100% !important;\n    height: 100% !important;\n  }\n\n  .nubo-inline-music-controls {\n    position: absolute !important;\n    z-index: 6 !important;\n    right: 12px !important;\n    top: 50% !important;\n    transform: translateY(-50%) !important;\n    width: 40px !important;\n    min-width: 40px !important;\n    gap: 8px !important;\n  }\n\n  .nubo-inline-music-toggle,\n  .nubo-inline-music-stop {\n    width: 40px !important;\n    min-width: 40px !important;\n    height: 40px !important;\n    min-height: 40px !important;\n    padding: 0 !important;\n    border-radius: 10px !important;\n  }\n\n  .nubo-inline-music-toggle::before,\n  .nubo-inline-music-stop::before {\n    font-size: 16px !important;\n  }\n}\n`;
  fs.writeFileSync(cssPath, css);
}

const rendered = fs.readFileSync(componentPath, 'utf8');
for (const token of [
  marker,
  'setSize: (width: number, height: number) => void;',
  'player.setSize(width, height);',
  'new ResizeObserver(scheduleSync)',
  'ref={frameRef}',
  "translate(-50%, -50%) scale(1.35)",
]) {
  if (!rendered.includes(token)) throw new Error(`youtube real-size v5 missing ${token}`);
}

console.log('Applied centered YouTube real-size player with symmetric crop');
