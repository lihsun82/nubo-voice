import fs from 'node:fs';

const path = 'app/inline-music-v13.css';
const marker = 'NUBO_YOUTUBE_FRAME_FILL_V3';
let css = fs.readFileSync(path, 'utf8');

if (!css.includes(marker)) {
  css += `\n\n/* ${marker}: make the actual YouTube player match the full-width 16:9 frame. */\n@media (max-width: 680px) {\n  .nubo-inline-music {\n    grid-template-columns: minmax(0, 1fr) 44px !important;\n    gap: 6px !important;\n    align-items: center !important;\n  }\n\n  .nubo-inline-music-frame {\n    position: relative !important;\n    width: 100% !important;\n    height: clamp(150px, calc(56.25vw - 46px), 260px) !important;\n    min-width: 0 !important;\n    aspect-ratio: 16 / 9 !important;\n    overflow: hidden !important;\n    border-radius: 12px !important;\n    background: #000 !important;\n  }\n\n  .nubo-inline-music-frame > div {\n    position: absolute !important;\n    inset: 0 !important;\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  .nubo-inline-music-frame iframe {\n    position: absolute !important;\n    inset: 0 !important;\n    left: 0 !important;\n    top: 0 !important;\n    width: 100% !important;\n    height: 100% !important;\n    max-width: none !important;\n    max-height: none !important;\n    transform: none !important;\n    transform-origin: center center !important;\n    border: 0 !important;\n  }\n\n  .nubo-inline-music-controls {\n    width: 44px !important;\n    min-width: 44px !important;\n    gap: 6px !important;\n    align-self: center !important;\n  }\n\n  .nubo-inline-music-toggle,\n  .nubo-inline-music-stop {\n    width: 44px !important;\n    min-width: 44px !important;\n    min-height: 44px !important;\n    height: 44px !important;\n    padding: 0 !important;\n    border-radius: 11px !important;\n  }\n\n  .nubo-inline-music-toggle::before,\n  .nubo-inline-music-stop::before {\n    font-size: 18px !important;\n  }\n\n  .nubo-inline-music-stop[aria-label=\"停止音樂\"]::before {\n    font-size: 15px !important;\n  }\n}\n`;
  fs.writeFileSync(path, css);
}

const rendered = fs.readFileSync(path, 'utf8');
for (const token of [
  marker,
  'height: clamp(150px, calc(56.25vw - 46px), 260px) !important',
  'width: 100% !important',
  'transform: none !important',
  'grid-template-columns: minmax(0, 1fr) 44px !important',
]) {
  if (!rendered.includes(token)) {
    throw new Error(`youtube frame fill v3 missing ${token}`);
  }
}

console.log('Applied full-width 16:9 YouTube frame and compact controls');
