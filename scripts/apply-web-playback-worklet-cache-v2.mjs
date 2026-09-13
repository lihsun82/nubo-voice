import fs from 'node:fs';

const path = 'lib/browser-audio.ts';
const oldUrl = '/nubo-pcm-playback-worklet.js?v=1';
const newUrl = '/nubo-pcm-playback-worklet.js?v=2';

let source = fs.readFileSync(path, 'utf8');
if (source.includes(oldUrl)) {
  source = source.split(oldUrl).join(newUrl);
  fs.writeFileSync(path, source);
}

const finalSource = fs.readFileSync(path, 'utf8');
if (!finalSource.includes(newUrl)) {
  throw new Error('playback worklet cache v2: cache-busted worklet URL not applied');
}

console.log('Applied PCM de-click worklet cache bust v2');
