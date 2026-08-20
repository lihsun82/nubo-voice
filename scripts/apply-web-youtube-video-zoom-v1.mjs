import fs from 'node:fs';

const path = 'app/inline-music-v13.css';
const marker = 'NUBO_YOUTUBE_VIDEO_ZOOM_V1';
let css = fs.readFileSync(path, 'utf8');

if (!css.includes(marker)) {
  css += `\n\n/* ${marker}: enlarge the actual YouTube iframe content, not only its card. */\n@media (max-width: 680px) {\n  .nubo-inline-music-frame {\n    position: relative !important;\n    overflow: hidden !important;\n  }\n\n  .nubo-inline-music-frame > div {\n    position: absolute !important;\n    inset: 0 !important;\n    width: 100% !important;\n    height: 100% !important;\n    overflow: hidden !important;\n  }\n\n  .nubo-inline-music-frame iframe {\n    position: absolute !important;\n    left: 50% !important;\n    top: 50% !important;\n    width: 180% !important;\n    height: 180% !important;\n    max-width: none !important;\n    max-height: none !important;\n    transform: translate(-50%, -50%) !important;\n    transform-origin: center center !important;\n  }\n}\n`;
  fs.writeFileSync(path, css);
}

for (const token of [marker, 'width: 180% !important', 'transform: translate(-50%, -50%) !important']) {
  if (!css.includes(token) && !fs.readFileSync(path, 'utf8').includes(token)) {
    throw new Error(`youtube video zoom missing ${token}`);
  }
}

console.log('Applied mobile YouTube actual-video zoom');
