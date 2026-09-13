import fs from 'node:fs';

const path = 'lib/nubo-guest-service-auto-intake.ts';
const marker = 'NUBO_GUEST_FRAGMENT_BUFFER_V1';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes(marker)) {
  const timerAnchor = 'let pendingSendTimer: number | null = null;';
  const bufferBlock = `${timerAnchor}\n\n// ${marker}: Gemini Live can emit one spoken request as several short input transcriptions.\n// Keep a short rolling window so phrases such as \"請送\" + \"兩條毛巾\" are classified together.\nconst GUEST_FRAGMENT_WINDOW_MS = 8_000;\nconst GUEST_FRAGMENT_MAX_PARTS = 8;\nlet recentGuestFragments: Array<{ text: string; at: number }> = [];\n\nfunction mergeRecentGuestTranscript(text: string) {\n  const now = Date.now();\n  recentGuestFragments = recentGuestFragments.filter((item) => now - item.at <= GUEST_FRAGMENT_WINDOW_MS);\n\n  const cleaned = text.trim();\n  const last = recentGuestFragments[recentGuestFragments.length - 1];\n  if (!last || compact(last.text) !== compact(cleaned)) {\n    recentGuestFragments.push({ text: cleaned, at: now });\n    recentGuestFragments = recentGuestFragments.slice(-GUEST_FRAGMENT_MAX_PARTS);\n  } else {\n    last.at = now;\n  }\n\n  return recentGuestFragments.map((item) => item.text).join(' ').trim();\n}`;

  if (!source.includes(timerAnchor)) {
    throw new Error('guest fragment buffer: timer anchor missing');
  }
  source = source.replace(timerAnchor, bufferBlock);

  const oldBlock = `  const classification = classifyNuboGuestServiceTranscript(text);\n  const state = loadState();\n\n  if (!state.active && !classification.matched) return;\n  if (!state.active && classification.matched) {\n    state.active = true;\n    state.startedAt = Date.now();\n  }\n\n  state.updatedAt = Date.now();\n  state.surname ||= extractSurname(text);\n  state.roomNumber ||= extractRoom(text);\n  state.contact ||= extractContact(text);\n\n  if (classification.matched || state.active) addIssuePart(state, text);`;

  const newBlock = `  const mergedText = mergeRecentGuestTranscript(text);\n  const classification = classifyNuboGuestServiceTranscript(mergedText);\n  const state = loadState();\n\n  const activatingFromFragments = !state.active && classification.matched;\n  if (!state.active && !classification.matched) return;\n  if (activatingFromFragments) {\n    state.active = true;\n    state.startedAt = Date.now();\n  }\n\n  state.updatedAt = Date.now();\n  state.surname ||= extractSurname(mergedText);\n  state.roomNumber ||= extractRoom(mergedText);\n  state.contact ||= extractContact(mergedText);\n\n  if (classification.matched || state.active) {\n    addIssuePart(state, activatingFromFragments ? mergedText : text);\n  }`;

  if (!source.includes(oldBlock)) {
    throw new Error('guest fragment buffer: intake classification anchor missing');
  }
  source = source.replace(oldBlock, newBlock);

  fs.writeFileSync(path, source);
}

if (!source.includes(marker)) {
  throw new Error('guest fragment buffer marker missing after patch');
}
if (!source.includes('classifyNuboGuestServiceTranscript(mergedText)')) {
  throw new Error('guest fragment buffer classification not applied');
}

console.log('Applied guest-service fragmented transcript buffer');
