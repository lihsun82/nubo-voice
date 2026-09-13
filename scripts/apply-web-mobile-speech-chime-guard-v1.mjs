import fs from 'node:fs';

const marker = 'NUBO_MOBILE_SPEECH_CHIME_GUARD_V1';

const oldBackgroundBlock = `  const userAgent = window.navigator.userAgent;\n  const isIpadOs =\n    /Macintosh/i.test(userAgent) &&\n    window.navigator.maxTouchPoints > 1;\n\n  const isMobileBrowser =\n    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||\n    isIpadOs;`;

const robustBackgroundBlock = `  const userAgent = window.navigator.userAgent;\n  const isIpadOs =\n    /Macintosh/i.test(userAgent) &&\n    window.navigator.maxTouchPoints > 1;\n\n  // ${marker}: do not trust userAgent alone. Android Chrome Desktop Site can\n  // present a desktop UA while still being a touch/coarse-pointer phone.\n  const isMobileBrowser =\n    /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||\n    isIpadOs ||\n    window.navigator.maxTouchPoints > 0 ||\n    window.matchMedia?.('(pointer: coarse)')?.matches === true;`;

const oldConsoleBlock = `    const userAgent = window.navigator.userAgent;\n    const isIpadOs =\n      /Macintosh/i.test(userAgent) && window.navigator.maxTouchPoints > 1;\n    const isMobileBrowser =\n      /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || isIpadOs;`;

const robustConsoleBlock = `    const userAgent = window.navigator.userAgent;\n    const isIpadOs =\n      /Macintosh/i.test(userAgent) && window.navigator.maxTouchPoints > 1;\n    // ${marker}: Desktop Site on Android may hide Android/Mobile in the UA.\n    const isMobileBrowser =\n      /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||\n      isIpadOs ||\n      window.navigator.maxTouchPoints > 0 ||\n      window.matchMedia?.('(pointer: coarse)')?.matches === true;`;

const backgroundPath = 'lib/nubo-background-name-listener.ts';
let background = fs.readFileSync(backgroundPath, 'utf8');
if (background.includes(oldBackgroundBlock)) {
  background = background.split(oldBackgroundBlock).join(robustBackgroundBlock);
  fs.writeFileSync(backgroundPath, background);
}
if (!background.includes(marker)) {
  throw new Error('mobile speech chime guard: background mobile guard not applied');
}

const consolePath = 'components/GeminiVoiceConsole.tsx';
let voice = fs.readFileSync(consolePath, 'utf8');
if (voice.includes(oldConsoleBlock)) {
  voice = voice.split(oldConsoleBlock).join(robustConsoleBlock);
  fs.writeFileSync(consolePath, voice);
}
if (!voice.includes(marker)) {
  throw new Error('mobile speech chime guard: Gemini mobile guard not applied');
}

const feedbackPath = 'lib/nubo-feedback-audio.ts';
let feedback = fs.readFileSync(feedbackPath, 'utf8');
const feedbackAnchor = `export function playTechSearchSound(durationMs = 1800) {\n  const audio = getAudioContext();`;
const feedbackReplacement = `export function playTechSearchSound(durationMs = 1800) {\n  // ${marker}: synthetic oscillator effects are disabled on phones/touch devices.\n  // They are nonessential and can be confused with browser/OS recognition chimes.\n  if (\n    /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent) ||\n    window.navigator.maxTouchPoints > 0 ||\n    window.matchMedia?.('(pointer: coarse)')?.matches === true\n  ) return;\n\n  const audio = getAudioContext();`;
if (feedback.includes(feedbackAnchor)) {
  feedback = feedback.replace(feedbackAnchor, feedbackReplacement);
  fs.writeFileSync(feedbackPath, feedback);
}
if (!feedback.includes(marker)) {
  throw new Error('mobile speech chime guard: tech sound guard not applied');
}

// Fail CI if an old UA-only mobile guard survives in either live listener path.
for (const [path, source] of [
  [backgroundPath, background],
  [consolePath, voice],
]) {
  if (
    source.includes('/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) ||\n    isIpadOs;') ||
    source.includes('/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent) || isIpadOs;')
  ) {
    throw new Error(`mobile speech chime guard: UA-only guard survived in ${path}`);
  }
}

console.log('Applied mobile SpeechRecognition/oscillator chime hard guard');
