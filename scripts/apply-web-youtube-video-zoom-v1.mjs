import fs from 'node:fs';

const path = 'app/inline-music-v13.css';
const marker = 'NUBO_YOUTUBE_VIDEO_ZOOM_V2';
let css = fs.readFileSync(path, 'utf8');

if (!css.includes(marker)) {
  css += `\n\n/* ${marker}: stronger mobile video crop + smaller controls. */\n@media (max-width: 680px) {\n  .nubo-inline-music-frame {\n    position: relative !important;\n    overflow: hidden !important;\n  }\n\n  .nubo-inline-music-frame > div {\n    position: absolute !important;\n    inset: 0 !important;\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  .nubo-inline-music-frame iframe {\n    position: absolute !important;\n    left: 50% !important;\n    top: 50% !important;\n    width: 230% !important;\n    height: 230% !important;\n    max-width: none !important;\n    max-height: none !important;\n    transform: translate(-50%, -50%) !important;\n    transform-origin: center center !important;\n  }\n\n  .nubo-inline-music {\n    grid-template-columns: minmax(0, 1fr) 48px !important;\n    gap: 7px !important;\n  }\n\n  .nubo-inline-music-controls {\n    width: 48px !important;\n    min-width: 48px !important;\n    gap: 7px !important;\n  }\n\n  .nubo-inline-music-toggle,\n  .nubo-inline-music-stop {\n    width: 48px !important;\n    min-width: 48px !important;\n    min-height: 48px !important;\n    height: 48px !important;\n    padding: 0 !important;\n    border-radius: 12px !important;\n  }\n\n  .nubo-inline-music-toggle::before,\n  .nubo-inline-music-stop::before {\n    font-size: 19px !important;\n  }\n\n  .nubo-inline-music-stop[aria-label=\"停止音樂\"]::before {\n    font-size: 16px !important;\n  }\n}\n`;
  fs.writeFileSync(path, css);
}

const rendered = fs.readFileSync(path, 'utf8');
for (const token of [
  marker,
  'width: 230% !important',
  'grid-template-columns: minmax(0, 1fr) 48px !important',
  'width: 48px !important',
]) {
  if (!rendered.includes(token)) {
    throw new Error(`youtube video zoom v2 missing ${token}`);
  }
}

console.log('Applied stronger mobile YouTube video zoom and smaller controls');
