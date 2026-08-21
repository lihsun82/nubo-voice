import fs from 'node:fs';

const path = 'app/inline-music-v13.css';
const marker = 'NUBO_YOUTUBE_RENDER_FILL_V4';
let css = fs.readFileSync(path, 'utf8');

if (!css.includes(marker)) {
  css += `\n\n/* ${marker}: scale the rendered YouTube surface itself so the visible video fills the frame. */\n@media (max-width: 680px) {\n  .nubo-inline-music {\n    grid-template-columns: minmax(0, 1fr) 44px !important;\n    gap: 6px !important;\n    align-items: center !important;\n  }\n\n  .nubo-inline-music-frame {\n    position: relative !important;\n    width: 100% !important;\n    height: clamp(150px, calc(56.25vw - 46px), 260px) !important;\n    min-width: 0 !important;\n    aspect-ratio: 16 / 9 !important;\n    overflow: hidden !important;\n    border-radius: 12px !important;\n    background: #000 !important;\n  }\n\n  .nubo-inline-music-frame > div {\n    position: absolute !important;\n    inset: 0 !important;\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  .nubo-inline-music-frame iframe {\n    position: absolute !important;\n    left: 50% !important;\n    top: 50% !important;\n    width: 100% !important;\n    height: 100% !important;\n    max-width: none !important;\n    max-height: none !important;\n    transform: translate(-50%, -50%) scale(1.08) !important;\n    transform-origin: center center !important;\n    border: 0 !important;\n    will-change: transform !important;\n    pointer-events: none !important;\n  }\n\n  .nubo-inline-music-controls {\n    width: 44px !important;\n    min-width: 44px !important;\n    gap: 6px !important;\n    align-self: center !important;\n  }\n\n  .nubo-inline-music-toggle,\n  .nubo-inline-music-stop {\n    width: 44px !important;\n    min-width: 44px !important;\n    min-height: 44px !important;\n    height: 44px !important;\n    padding: 0 !important;\n    border-radius: 11px !important;\n  }\n\n  .nubo-inline-music-toggle::before,\n  .nubo-inline-music-stop::before {\n    font-size: 18px !important;\n  }\n\n  .nubo-inline-music-stop[aria-label=\"停止音樂\"]::before {\n    font-size: 15px !important;\n  }\n}\n`;
  fs.writeFileSync(path, css);
}

const rendered = fs.readFileSync(path, 'utf8');
for (const token of [
  marker,
  'transform: translate(-50%, -50%) scale(1.08) !important',
  'width: 100% !important',
  'height: clamp(150px, calc(56.25vw - 46px), 260px) !important',
  'grid-template-columns: minmax(0, 1fr) 44px !important',
]) {
  if (!rendered.includes(token)) {
    throw new Error(`youtube render fill v4 missing ${token}`);
  }
}

console.log('Applied subtitle-safe YouTube surface scaling for mobile frame fill');
