import fs from 'node:fs';

const marker = 'NUBO_MOBILE_SPEECH_CHIME_GUARD_V1';

const robustMobileBlock = `  const userAgent = window.navigator.userAgent;\n  const isIpadOs =\n    /Macintosh/i.test(userAgent) &&\n    window.navigator.maxTouchPoints > 1;\n\n  // ${marker}: do not trust userAgent alone. Android Chrome Desktop Site can\n  // present a desktop UA while still being a touch/coarse-pointer phone.\n  const isMobileBrowser =\n    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||\n    isIpadOs ||\n    window.navigator.maxTouchPoints > 0 ||\n    window.matchMedia?.('(pointer: coarse)')?.matches === true;`;

const compactRobustMobileBlock = `    const userAgent = window.navigator.userAgent;\n    const isIpadOs =\n      /Macintosh/i.test(userAgent) && window.navigator.maxTouchPoints > 1;\n    // ${marker}: Desktop Site on Android may hide Android/Mobile in the UA.\n    const isMobileBrowser =\n      /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||\n      isIpadOs ||\n      window.navigator.maxTouchPoints > 0 ||\n      window.matchMedia?.('(pointer: coarse)')?.matches === true;`;

const backgroundPath = 'lib/nubo-background-name-listener.ts';
let background = fs.readFileSync(backgroundPath, 'utf8');
if (!background.includes(marker)) {
  const oldBlock = `  const userAgent = window.navigator.userAgent;\n  const isIpadOs =\n    /Macintosh/i.test(userAgent) &&\n    window.navigator.maxTouchPoints > 1;\n\n  const isMobileBrowser =\n    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||\n    isIpadOs;`;
  if (!background.includes(oldBlock)) {
    throw new Error('mobile speech chime guard: background mobile block not found');
  }
  background = background.replace(oldBlock, robustMobileBlock);
  fs.writeFileSync(backgroundPath, background);
}

const consolePath = 'components/GeminiVoiceConsole.tsx';
let voice = fs.readFileSync(consolePath, 'utf8');
if (!voice.includes(marker)) {
  const oldCompactBlock = `    const userAgent = window.navigator.userAgent;\n    const isIpadOs =\n      /Macintosh/i.test(userAgent) && window.navigator.maxTouchPoints > 1;\n    const isMobileBrowser =\n      /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || isIpadOs;`;
  if (!voice.includes(oldCompactBlock)) {
    throw new Error('mobile speech chime guard: Gemini mobile block not found');
  }
  voice = voice.split(oldCompactBlock).join(compactRobustMobileBlock);
  fs.writeFileSync(consolePath, voice);
}

const feedbackPath = 'lib/nubo-feedback-audio.ts';
let feedback = fs.readFileSync(feedbackPath, 'utf8');
if (!feedback.includes(marker)) {
  const anchor = `export function playTechSearchSound(durationMs = 1800) {\n  const audio = getAudioContext();`;
  const replacement = `export function playTechSearchSound(durationMs = 1800) {\n  // ${marker}: synthetic oscillator effects are disabled on phones/touch devices.\n  // They are nonessential and can be confused with browser/OS recognition chimes.\n  if (\n    /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent) ||\n    window.navigator.maxTouchPoints > 0 ||\n    window.matchMedia?.('(pointer: coarse)')?.matches === true\n  ) return;\n\n  const audio = getAudioContext();`;
  if (!feedback.includes(anchor)) {
    throw new Error('mobile speech chime guard: tech sound anchor not found');
  }
  feedback = feedback.replace(anchor, replacement);
  fs.writeFileSync(feedbackPath, feedback);
}

for (const [path, token] of [
  [backgroundPath, marker],
  [consolePath, marker],
  [feedbackPath, marker],
]) {
  if (!fs.readFileSync(path, 'utf8').includes(token)) {
    throw new Error(`mobile speech chime guard verification failed: ${path}`);
  }
}

console.log('Applied mobile SpeechRecognition/oscillator chime hard guard');
