import fs from 'node:fs';

const path = 'components/GeminiVoiceConsole.tsx';
let s = fs.readFileSync(path, 'utf8');

const importAnchor = 'import { sendTranscriptToNameAlert } from "@/lib/nubo-name-alert-client";';
const intakeImport = 'import { processNuboGuestServiceTranscript } from "@/lib/nubo-guest-service-auto-intake";';
if (!s.includes(intakeImport)) {
  if (!s.includes(importAnchor)) throw new Error('Guest service fallback: import anchor missing');
  s = s.replace(importAnchor, `${importAnchor}\n${intakeImport}`);
}

if (!s.includes('NUBO_GUEST_SERVICE_EAGER_TRANSCRIPT_V1')) {
  const transcriptAnchor = `          const userText = serverContent?.inputTranscription?.text;\n          const modelText = serverContent?.outputTranscription?.text;\n          if (typeof modelText === "string" && modelText.trim()) {`;
  const transcriptPatch = `          const userText = serverContent?.inputTranscription?.text;\n          const modelText = serverContent?.outputTranscription?.text;\n\n          // NUBO_GUEST_SERVICE_EAGER_TRANSCRIPT_V1\n          // Process hotel guest requests before model-output branching. Gemini Live can\n          // deliver input and output transcriptions together; the old else-if path could\n          // skip the guest sentence even though NUBO verbally acknowledged it.\n          if (typeof userText === "string" && userText.trim()) {\n            void processNuboGuestServiceTranscript(userText.trim()).catch((cause) => {\n              console.warn("NUBO eager guest-service intake failed", cause);\n            });\n          }\n\n          if (typeof modelText === "string" && modelText.trim()) {`;
  if (!s.includes(transcriptAnchor)) {
    throw new Error('Guest service eager transcript anchor missing');
  }
  s = s.replace(transcriptAnchor, transcriptPatch);
}

if (!s.includes('NUBO_GUEST_SERVICE_DETERMINISTIC_FALLBACK_V2')) {
  const anchor = `notifyNuboVoicePhase("thinking");\n\nvoid sendTranscriptToNameAlert(trimmedUserText);\n\nacknowledgeQuestion(trimmedUserText);`;
  const patch = `notifyNuboVoicePhase("thinking");\n\nvoid sendTranscriptToNameAlert(trimmedUserText);\n\n// NUBO_GUEST_SERVICE_DETERMINISTIC_FALLBACK_V2\n// Keep a second deterministic feed on the normal user-transcript path. Local and\n// server de-duplication prevent duplicate LINE alerts when both paths see the same text.\nvoid processNuboGuestServiceTranscript(trimmedUserText).catch((cause) => {\n  console.warn("NUBO deterministic guest-service fallback failed", cause);\n});\n\nacknowledgeQuestion(trimmedUserText);`;
  if (!s.includes(anchor)) throw new Error('Guest service fallback: transcript anchor missing');
  s = s.replace(anchor, patch);
}

if (!s.includes(intakeImport)) throw new Error('Guest service fallback import missing after patch');
if (!s.includes('NUBO_GUEST_SERVICE_EAGER_TRANSCRIPT_V1')) {
  throw new Error('Guest service eager transcript patch missing');
}
if (!s.includes('processNuboGuestServiceTranscript(userText.trim())')) {
  throw new Error('Guest service eager transcript runtime call missing');
}
if (!s.includes('processNuboGuestServiceTranscript(trimmedUserText)')) {
  throw new Error('Guest service fallback call missing after patch');
}

fs.writeFileSync(path, s);
console.log('Applied NUBO guest-service deterministic fallback v3');
