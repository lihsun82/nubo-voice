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
  const modelLine = '          const modelText = serverContent?.outputTranscription?.text;';
  const eagerBlock = `${modelLine}\n\n          // NUBO_GUEST_SERVICE_EAGER_TRANSCRIPT_V1\n          if (typeof userText === "string" && userText.trim()) {\n            void processNuboGuestServiceTranscript(userText.trim()).catch((cause) => {\n              console.warn("NUBO eager guest-service intake failed", cause);\n            });\n          }`;
  if (!s.includes(modelLine)) {
    throw new Error('Guest service eager modelText anchor missing');
  }
  s = s.replace(modelLine, eagerBlock);
}

if (!s.includes('NUBO_GUEST_SERVICE_DETERMINISTIC_FALLBACK_V2')) {
  const anchor = `notifyNuboVoicePhase("thinking");\n\nvoid sendTranscriptToNameAlert(trimmedUserText);\n\nacknowledgeQuestion(trimmedUserText);`;
  const patch = `notifyNuboVoicePhase("thinking");\n\nvoid sendTranscriptToNameAlert(trimmedUserText);\n\n// NUBO_GUEST_SERVICE_DETERMINISTIC_FALLBACK_V2\nvoid processNuboGuestServiceTranscript(trimmedUserText).catch((cause) => {\n  console.warn("NUBO deterministic guest-service fallback failed", cause);\n});\n\nacknowledgeQuestion(trimmedUserText);`;
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
